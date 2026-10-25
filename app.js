'use strict';

// Каталог приходит из собственного API (Node.js + SQLite), а не зашит в HTML.
let PRODUCTS = [];

const STORAGE_KEYS = {
  cart: 'marketly_cart_v1',
  favorites: 'marketly_favorites_v1'
};

const FREE_SHIPPING_LIMIT = 20000;
const DELIVERY_FEE = 1500;
const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const formatMoney = (amount) => `${moneyFormatter.format(amount)} ₸`;

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Не удалось прочитать ${key} из localStorage:`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Не удалось сохранить ${key} в localStorage:`, error);
    if (elements.toastRegion) showToast('Браузер не разрешил сохранить изменения.', 'error');
  }
}

// До получения каталога можно проверить только структуру сохранённых данных.
function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart)) return [];
  return rawCart
    .filter((item) => item && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0)
    .map((item) => ({
      id: Number(item.id),
      quantity: Math.max(1, Math.min(99, Number.parseInt(item.quantity, 10) || 1))
    }));
}

function normalizeFavorites(rawFavorites) {
  if (!Array.isArray(rawFavorites)) return [];
  return [...new Set(rawFavorites.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

const state = {
  category: 'all',
  search: '',
  sort: 'popular',
  minPrice: null,
  maxPrice: null,
  cart: normalizeCart(readStorage(STORAGE_KEYS.cart, [])),
  favorites: normalizeFavorites(readStorage(STORAGE_KEYS.favorites, []))
};

const elements = {
  productGrid: document.getElementById('productGrid'),
  resultCount: document.getElementById('resultCount'),
  emptyState: document.getElementById('emptyState'),
  categoryList: document.getElementById('categoryList'),
  sortSelect: document.getElementById('sortSelect'),
  searchInput: document.getElementById('searchInput'),
  mobileSearchInput: document.getElementById('mobileSearchInput'),
  mobileSearchRow: document.getElementById('mobileSearchRow'),
  mobileSearchToggle: document.getElementById('mobileSearchToggle'),
  minPrice: document.getElementById('minPrice'),
  maxPrice: document.getElementById('maxPrice'),
  applyPriceFilter: document.getElementById('applyPriceFilter'),
  activeFilters: document.getElementById('activeFilters'),
  activeFilterText: document.getElementById('activeFilterText'),
  clearFiltersButton: document.getElementById('clearFiltersButton'),
  resetSearchButton: document.getElementById('resetSearchButton'),
  cartCount: document.getElementById('cartCount'),
  openCartButton: document.getElementById('openCartButton'),
  closeCartButton: document.getElementById('closeCartButton'),
  continueShoppingButton: document.getElementById('continueShoppingButton'),
  overlay: document.getElementById('overlay'),
  cartDrawer: document.getElementById('cartDrawer'),
  drawerItemCount: document.getElementById('drawerItemCount'),
  cartItems: document.getElementById('cartItems'),
  cartEmpty: document.getElementById('cartEmpty'),
  cartSummary: document.getElementById('cartSummary'),
  shippingMessage: document.getElementById('shippingMessage'),
  shippingPercent: document.getElementById('shippingPercent'),
  shippingProgressFill: document.getElementById('shippingProgressFill'),
  subtotalValue: document.getElementById('subtotalValue'),
  deliveryValue: document.getElementById('deliveryValue'),
  totalValue: document.getElementById('totalValue'),
  checkoutButton: document.getElementById('checkoutButton'),
  checkoutModal: document.getElementById('checkoutModal'),
  closeCheckoutButton: document.getElementById('closeCheckoutButton'),
  checkoutForm: document.getElementById('checkoutForm'),
  checkoutTotal: document.getElementById('checkoutTotal'),
  checkoutItemsSummary: document.getElementById('checkoutItemsSummary'),
  successModal: document.getElementById('successModal'),
  successMessage: document.getElementById('successMessage'),
  successOrderNumber: document.getElementById('successOrderNumber'),
  successDoneButton: document.getElementById('successDoneButton'),
  newsletterForm: document.getElementById('newsletterForm'),
  toastRegion: document.getElementById('toastRegion'),
  productDetailsModal: document.getElementById('productDetailsModal'),
  productDetailsBody: document.getElementById('productDetailsBody'),
  closeProductDetailsButton: document.getElementById('closeProductDetailsButton')
};

// ============================================
// API: запросы к серверу
// ============================================

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `Ошибка сервера (${response.status}).`);
  }
  return payload;
}

async function loadProducts({ quiet = false } = {}) {
  try {
    let data;
    try {
      data = await requestJson('/api/products');
    } catch {
      data = await requestJson('./products.json');
    }
    if (!Array.isArray(data)) throw new Error('Сервер вернул каталог в неизвестном формате.');

    PRODUCTS = data.map((product) => ({
      ...product,
      id: Number(product.id),
      price: Number(product.price),
      oldPrice: product.oldPrice == null ? null : Number(product.oldPrice),
      rating: Number(product.rating || 0),
      reviews: Number(product.reviews || 0),
      popularity: Number(product.popularity || 0),
      stock: Math.max(0, Number(product.stock || 0)),
      art: String(product.art || '📦')
    }));

    // Удаляем из старой корзины товары, которых больше нет в каталоге,
    // и приводим количество к текущему остатку на складе.
    state.cart = state.cart.flatMap((item) => {
      const product = PRODUCTS.find((candidate) => candidate.id === item.id);
      if (!product || product.stock < 1) return [];
      return [{ id: item.id, quantity: Math.min(item.quantity, product.stock, 99) }];
    });
    state.favorites = state.favorites.filter((id) => PRODUCTS.some((product) => product.id === id));
    persistCart();
    persistFavorites();

    renderProducts();
    renderCart();
    updateCategoryCounts();
    return true;
  } catch (error) {
    console.error('Не удалось загрузить каталог:', error);
    if (!quiet) {
      elements.productGrid.innerHTML = '<div class="api-error">Не удалось загрузить товары. Проверьте, что сервер запущен, и обновите страницу.</div>';
      elements.resultCount.textContent = 'Ошибка загрузки';
      showToast('Не удалось получить каталог с сервера. Запустите проект командой npm start.', 'error');
    }
    return false;
  }
}

// ============================================
// Утилиты
// ============================================

function getProduct(productId) {
  return PRODUCTS.find((product) => product.id === Number(productId));
}

function getCartQuantity() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function getSubtotal() {
  return state.cart.reduce((sum, item) => {
    const product = getProduct(item.id);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

function getDeliveryFee(subtotal = getSubtotal()) {
  if (!subtotal) return 0;
  return subtotal >= FREE_SHIPPING_LIMIT ? 0 : DELIVERY_FEE;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function pluralize(number, forms) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

// ============================================
// Каталог: поиск, фильтры, сортировка
// ============================================

function getVisibleProducts() {
  const query = state.search.trim().toLocaleLowerCase('ru-RU');
  const visible = PRODUCTS.filter((product) => {
    const matchesCategory = state.category === 'all' || product.category === state.category;
    const searchable = `${product.name} ${product.categoryLabel} ${product.description} ${product.details || ''}`.toLocaleLowerCase('ru-RU');
    const matchesSearch = !query || searchable.includes(query);
    const matchesMinPrice = state.minPrice === null || product.price >= state.minPrice;
    const matchesMaxPrice = state.maxPrice === null || product.price <= state.maxPrice;
    return matchesCategory && matchesSearch && matchesMinPrice && matchesMaxPrice;
  });

  switch (state.sort) {
    case 'price-asc': visible.sort((a, b) => a.price - b.price); break;
    case 'price-desc': visible.sort((a, b) => b.price - a.price); break;
    case 'name': visible.sort((a, b) => a.name.localeCompare(b.name, 'ru')); break;
    default: visible.sort((a, b) => b.popularity - a.popularity);
  }
  return visible;
}

function renderProductCard(product) {
  const favorite = state.favorites.includes(product.id);
  const inCart = state.cart.some((item) => item.id === product.id);
  const badgeClass = product.badge && product.badge.startsWith('-') ? 'product-badge sale' : 'product-badge';
  const oldPrice = product.oldPrice ? `<span class="old-price">${formatMoney(product.oldPrice)}</span>` : '';
  const badge = product.badge ? `<span class="${badgeClass}">${escapeHTML(product.badge)}</span>` : '';
  const favoriteLabel = favorite ? 'Убрать из избранного' : 'Добавить в избранное';
  const stockText = product.stock > 0 ? `В наличии: ${product.stock}` : 'Нет в наличии';

  return `
    <article class="product-card" data-product-id="${product.id}">
      <div class="product-image-wrap ${escapeHTML(product.tone)}">
        ${badge}
        <button class="favorite-button ${favorite ? 'is-favorite' : ''}" type="button" data-action="favorite" data-id="${product.id}" aria-label="${favoriteLabel}" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button>
        <img class="product-art" src="./assets/products/${product.id}.svg" alt="${escapeHTML(product.name)}" loading="lazy">
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHTML(product.categoryLabel)}</span>
        <div class="product-title-row">
          <h3 class="product-title">${escapeHTML(product.name)}</h3>
          <div class="product-rating" aria-label="Рейтинг ${product.rating} из 5"><span>★</span>${product.rating.toFixed(1)}</div>
        </div>
        <p class="product-description">${escapeHTML(product.description)}</p>
        <button class="product-details-link" type="button" data-action="details" data-id="${product.id}">Подробнее о товаре →</button>
        <div class="product-bottom">
          <div class="price-block"><strong class="product-price">${formatMoney(product.price)}</strong>${oldPrice}</div>
          <button class="add-to-cart ${inCart ? 'added' : ''}" type="button" data-action="add" data-id="${product.id}" aria-label="${inCart ? 'Добавить ещё' : 'Добавить в корзину'}: ${escapeHTML(product.name)}" ${product.stock < 1 ? 'disabled' : ''}>${product.stock < 1 ? '×' : (inCart ? '✓' : '+')}</button>
        </div>
        <span class="product-stock-note">${stockText}</span>
      </div>
    </article>`;
}

function renderProducts() {
  const products = getVisibleProducts();
  elements.productGrid.innerHTML = products.map(renderProductCard).join('');
  elements.resultCount.textContent = `${products.length} ${pluralize(products.length, ['товар', 'товара', 'товаров'])}`;
  elements.emptyState.hidden = products.length > 0;
  elements.productGrid.hidden = products.length === 0;
  updateCategoryButtons();
  updateFilterSummary();
}

function updateCategoryButtons() {
  elements.categoryList.querySelectorAll('[data-category]').forEach((button) => {
    const selected = button.dataset.category === state.category;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function updateCategoryCounts() {
  const allCount = elements.categoryList.querySelector('[data-category="all"] span');
  if (allCount) allCount.textContent = String(PRODUCTS.length);
}

function updateFilterSummary() {
  const hasPrice = state.minPrice !== null || state.maxPrice !== null;
  const hasFilters = state.category !== 'all' || state.search.trim() !== '' || hasPrice;
  elements.activeFilters.hidden = !hasFilters;
  if (!hasFilters) return;

  const pieces = [];
  if (state.category !== 'all') {
    const categoryButton = [...elements.categoryList.querySelectorAll('[data-category]')]
      .find((button) => button.dataset.category === state.category);
    if (categoryButton) pieces.push(categoryButton.textContent.trim().replace(/\s+\d+$/, ''));
  }
  if (state.search.trim()) pieces.push(`Поиск: «${state.search.trim()}»`);
  if (hasPrice) {
    const from = state.minPrice === null ? '0' : formatMoney(state.minPrice);
    const to = state.maxPrice === null ? 'без ограничения' : formatMoney(state.maxPrice);
    pieces.push(`Цена: ${from} — ${to}`);
  }
  elements.activeFilterText.textContent = pieces.join(' · ');
}

function applyPriceFilter() {
  const minText = elements.minPrice.value.trim();
  const maxText = elements.maxPrice.value.trim();
  const min = minText === '' ? null : Number(minText);
  const max = maxText === '' ? null : Number(maxText);

  if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
    showToast('Введите неотрицательную цену.', 'error');
    return;
  }
  if (min !== null && max !== null && min > max) {
    showToast('Минимальная цена не может быть выше максимальной.', 'error');
    return;
  }

  state.minPrice = min;
  state.maxPrice = max;
  renderProducts();
}

function clearFilters() {
  state.category = 'all';
  state.search = '';
  state.sort = 'popular';
  state.minPrice = null;
  state.maxPrice = null;
  elements.searchInput.value = '';
  elements.mobileSearchInput.value = '';
  elements.minPrice.value = '';
  elements.maxPrice.value = '';
  elements.sortSelect.value = 'popular';
  renderProducts();
}

// ============================================
// localStorage: корзина и избранное
// ============================================

function persistCart() {
  writeStorage(STORAGE_KEYS.cart, state.cart);
}

function persistFavorites() {
  writeStorage(STORAGE_KEYS.favorites, state.favorites);
}

// ============================================
// Карточка с подробной информацией
// ============================================

function openProductDetails(productId) {
  const product = getProduct(productId);
  if (!product) return;

  const oldPrice = product.oldPrice
    ? `<span class="details-old-price">${formatMoney(product.oldPrice)}</span>`
    : '';
  const stockLabel = product.stock > 0
    ? `В наличии: ${product.stock} шт.`
    : 'Товар временно отсутствует';
  const stockClass = product.stock > 0 ? 'in-stock' : 'out-of-stock';

  elements.productDetailsBody.innerHTML = `
    <div class="product-details-layout">
      <div class="product-details-art ${escapeHTML(product.tone)}"><img class="product-details-image" src="./assets/products/${product.id}.svg" alt="${escapeHTML(product.name)}"></div>
      <div class="product-details-copy">
        <span class="product-category">${escapeHTML(product.categoryLabel)}</span>
        <h2 id="productDetailsTitle">${escapeHTML(product.name)}</h2>
        <div class="details-rating"><span>★</span> ${product.rating.toFixed(1)} · ${product.reviews} отзывов</div>
        <p class="details-description">${escapeHTML(product.details || product.description)}</p>
        <p class="details-stock ${stockClass}">${stockLabel}</p>
        <div class="details-price-row"><strong>${formatMoney(product.price)}</strong>${oldPrice}</div>
        <button class="primary-button details-add-button" type="button" data-action="detail-add" data-id="${product.id}" ${product.stock < 1 ? 'disabled' : ''}>${product.stock < 1 ? 'Нет в наличии' : 'Добавить в корзину'} <span>→</span></button>
      </div>
    </div>`;

  elements.productDetailsModal.hidden = false;
  document.body.classList.add('no-scroll');
  elements.closeProductDetailsButton.focus();
}

function closeProductDetails() {
  elements.productDetailsModal.hidden = true;
  if (elements.checkoutModal.hidden && elements.successModal.hidden && !elements.cartDrawer.classList.contains('open')) {
    document.body.classList.remove('no-scroll');
  }
}

// ============================================
// Корзина
// ============================================

function addToCart(productId) {
  const product = getProduct(productId);
  if (!product) return;
  if (product.stock < 1) {
    showToast('Этого товара сейчас нет в наличии.', 'error');
    return;
  }

  const existing = state.cart.find((item) => item.id === product.id);
  const quantityInCart = existing ? existing.quantity : 0;
  if (quantityInCart >= product.stock || quantityInCart >= 99) {
    showToast('Нельзя добавить больше товара, чем есть в наличии.', 'error');
    return;
  }
  if (existing) existing.quantity += 1;
  else state.cart.push({ id: product.id, quantity: 1 });

  persistCart();
  renderProducts();
  renderCart();
  showToast(`${product.name} добавлен в корзину.`);
}

function changeQuantity(productId, delta) {
  const item = state.cart.find((cartItem) => cartItem.id === Number(productId));
  const product = getProduct(productId);
  if (!item || !product) return;
  const nextQuantity = item.quantity + delta;
  if (nextQuantity <= 0) {
    removeFromCart(productId);
    return;
  }
  if (nextQuantity > product.stock || nextQuantity > 99) {
    showToast('На складе недостаточно этого товара.', 'error');
    return;
  }
  item.quantity = nextQuantity;
  persistCart();
  renderCart();
  renderProducts();
}

function removeFromCart(productId) {
  const product = getProduct(productId);
  state.cart = state.cart.filter((item) => item.id !== Number(productId));
  persistCart();
  renderCart();
  renderProducts();
  if (product) showToast(`${product.name} удалён из корзины.`);
}

function toggleFavorite(productId) {
  const numericId = Number(productId);
  const product = getProduct(numericId);
  if (!product) return;
  const wasFavorite = state.favorites.includes(numericId);
  state.favorites = wasFavorite
    ? state.favorites.filter((id) => id !== numericId)
    : [...state.favorites, numericId];
  persistFavorites();
  renderProducts();
  showToast(wasFavorite ? 'Удалено из избранного.' : 'Добавлено в избранное.');
}

function renderCart() {
  const quantity = getCartQuantity();
  const subtotal = getSubtotal();
  const deliveryFee = getDeliveryFee(subtotal);
  const total = subtotal + deliveryFee;
  const empty = state.cart.length === 0;

  elements.cartCount.textContent = quantity > 99 ? '99+' : String(quantity);
  elements.drawerItemCount.textContent = `(${quantity})`;
  elements.cartEmpty.hidden = !empty;
  elements.cartItems.hidden = empty;
  elements.cartSummary.hidden = empty;

  elements.cartItems.innerHTML = state.cart.map((item) => {
    const product = getProduct(item.id);
    if (!product) return '';
    return `
      <article class="cart-item">
        <div class="cart-item-art ${escapeHTML(product.tone)}"><img src="./assets/products/${product.id}.svg" alt="" loading="lazy"></div>
        <div class="cart-item-content">
          <small>${escapeHTML(product.categoryLabel)}</small>
          <h3>${escapeHTML(product.name)}</h3>
          <span class="cart-item-price">${formatMoney(product.price * item.quantity)}</span>
          <div class="quantity-control" aria-label="Количество товара ${escapeHTML(product.name)}">
            <button type="button" data-cart-action="decrease" data-id="${product.id}" aria-label="Уменьшить количество">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-action="increase" data-id="${product.id}" aria-label="Увеличить количество" ${item.quantity >= product.stock ? 'disabled' : ''}>+</button>
          </div>
        </div>
        <button class="cart-item-remove" type="button" data-cart-action="remove" data-id="${product.id}" aria-label="Удалить ${escapeHTML(product.name)}">×</button>
      </article>`;
  }).join('');

  elements.subtotalValue.textContent = formatMoney(subtotal);
  elements.deliveryValue.textContent = subtotal >= FREE_SHIPPING_LIMIT ? 'Бесплатно' : (subtotal ? formatMoney(DELIVERY_FEE) : '—');
  elements.totalValue.textContent = formatMoney(total);

  const progress = Math.min(100, Math.round((subtotal / FREE_SHIPPING_LIMIT) * 100));
  elements.shippingProgressFill.style.width = `${progress}%`;
  elements.shippingPercent.textContent = `${progress}%`;
  elements.shippingMessage.textContent = subtotal >= FREE_SHIPPING_LIMIT
    ? 'Отлично! Доставка за наш счёт'
    : `До бесплатной доставки осталось ${formatMoney(FREE_SHIPPING_LIMIT - subtotal)}`;
}

function openCart() {
  closeCheckout();
  closeProductDetails();
  elements.overlay.hidden = false;
  elements.cartDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => {
    elements.overlay.classList.add('visible');
    elements.cartDrawer.classList.add('open');
  });
  elements.closeCartButton.focus();
}

function closeCart() {
  elements.overlay.classList.remove('visible');
  elements.cartDrawer.classList.remove('open');
  elements.cartDrawer.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (!elements.cartDrawer.classList.contains('open')) elements.overlay.hidden = true;
  }, 260);
  if (elements.checkoutModal.hidden && elements.successModal.hidden && elements.productDetailsModal.hidden) {
    document.body.classList.remove('no-scroll');
  }
}

// ============================================
// Оформление заказа и отправка POST в API
// ============================================

function openCheckout() {
  if (!state.cart.length) {
    showToast('Сначала добавьте товары в корзину.', 'error');
    return;
  }
  closeCart();
  elements.checkoutForm.reset();
  updateCheckoutPreview();
  elements.checkoutModal.hidden = false;
  document.body.classList.add('no-scroll');
  window.setTimeout(() => document.getElementById('customerName').focus(), 20);
}

function closeCheckout() {
  elements.checkoutModal.hidden = true;
  if (elements.successModal.hidden && !elements.cartDrawer.classList.contains('open') && elements.productDetailsModal.hidden) {
    document.body.classList.remove('no-scroll');
  }
}

function updateCheckoutPreview() {
  const subtotal = getSubtotal();
  const total = subtotal + getDeliveryFee(subtotal);
  const quantity = getCartQuantity();
  const delivery = getDeliveryFee(subtotal);
  elements.checkoutTotal.textContent = formatMoney(total);
  elements.checkoutItemsSummary.textContent = `${quantity} ${pluralize(quantity, ['товар', 'товара', 'товаров'])} · доставка ${delivery ? formatMoney(delivery) : 'бесплатно'}`;
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();
  if (!elements.checkoutForm.reportValidity()) return;
  if (!state.cart.length) {
    closeCheckout();
    showToast('Корзина пуста. Добавьте товары перед оформлением.', 'error');
    return;
  }

  const formData = new FormData(elements.checkoutForm);
  const customer = {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    city: String(formData.get('city') || '').trim(),
    address: String(formData.get('address') || '').trim(),
    paymentMethod: String(formData.get('paymentMethod') || '').trim(),
    comment: String(formData.get('comment') || '').trim()
  };

  if (customer.name.split(/\s+/).filter(Boolean).length < 2) {
    showToast('Введите фамилию и имя покупателя.', 'error');
    document.getElementById('customerName').focus();
    return;
  }
  if (customer.phone.replace(/\D/g, '').length < 10) {
    showToast('Введите корректный номер телефона.', 'error');
    document.getElementById('customerPhone').focus();
    return;
  }

  const submitButton = elements.checkoutForm.querySelector('.checkout-submit');
  const originalButtonText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = 'Отправка заказа…';

  try {
    const payload = {
      customer,
      items: state.cart.map((item) => ({ productId: item.id, quantity: item.quantity }))
    };

    // Fetch API отправляет JSON на POST /api/orders. Сервер берёт цены из SQLite.
    const result = await requestJson('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    elements.successMessage.textContent = `Спасибо, ${customer.name}! Заказ на ${formatMoney(result.total)} сохранён. Выбранный способ оплаты: ${getPaymentLabel(customer.paymentMethod)}. Оплата не списывалась.`;
    elements.successOrderNumber.textContent = `Заказ № ${result.orderNumber}`;
    elements.checkoutModal.hidden = true;
    elements.successModal.hidden = false;
    document.body.classList.add('no-scroll');

    state.cart = [];
    persistCart();
    renderCart();
    await loadProducts({ quiet: true });
    elements.checkoutForm.reset();
  } catch (error) {
    console.error('Не удалось оформить заказ:', error);
    showToast(error.message || 'Не удалось сохранить заказ. Попробуйте ещё раз.', 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonText;
  }
}

function getPaymentLabel(value) {
  const labels = {
    cash_on_delivery: 'наличными при получении',
    card_on_delivery: 'картой при получении',
    bank_transfer_demo: 'банковский перевод (демо)'
  };
  return labels[value] || 'не выбран';
}

function closeSuccess() {
  elements.successModal.hidden = true;
  document.body.classList.remove('no-scroll');
}

// ============================================
// Уведомления
// ============================================

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' error' : ''}`;
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = type === 'error' ? '!' : '✓';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);
  elements.toastRegion.append(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function setSearch(query) {
  state.search = query;
  if (elements.searchInput.value !== query) elements.searchInput.value = query;
  if (elements.mobileSearchInput.value !== query) elements.mobileSearchInput.value = query;
  renderProducts();
}

// ============================================
// Привязка событий через addEventListener
// ============================================

function initEvents() {
  elements.productGrid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'add') addToCart(button.dataset.id);
    if (button.dataset.action === 'favorite') toggleFavorite(button.dataset.id);
    if (button.dataset.action === 'details') openProductDetails(button.dataset.id);
  });

  elements.productDetailsBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="detail-add"]');
    if (!button) return;
    const productId = Number(button.dataset.id);
    addToCart(productId);
    closeProductDetails();
  });

  elements.categoryList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-category]');
    if (!button) return;
    state.category = button.dataset.category;
    renderProducts();
  });

  elements.sortSelect.addEventListener('change', () => {
    state.sort = elements.sortSelect.value;
    renderProducts();
  });
  elements.searchInput.addEventListener('input', () => setSearch(elements.searchInput.value));
  elements.mobileSearchInput.addEventListener('input', () => setSearch(elements.mobileSearchInput.value));
  elements.mobileSearchToggle.addEventListener('click', () => {
    elements.mobileSearchRow.hidden = !elements.mobileSearchRow.hidden;
    if (!elements.mobileSearchRow.hidden) elements.mobileSearchInput.focus();
  });

  elements.applyPriceFilter.addEventListener('click', applyPriceFilter);
  [elements.minPrice, elements.maxPrice].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyPriceFilter();
    });
  });
  elements.clearFiltersButton.addEventListener('click', clearFilters);
  elements.resetSearchButton.addEventListener('click', clearFilters);

  elements.openCartButton.addEventListener('click', openCart);
  elements.closeCartButton.addEventListener('click', closeCart);
  elements.continueShoppingButton.addEventListener('click', closeCart);
  elements.overlay.addEventListener('click', closeCart);
  elements.cartItems.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cart-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.cartAction === 'increase') changeQuantity(id, 1);
    if (button.dataset.cartAction === 'decrease') changeQuantity(id, -1);
    if (button.dataset.cartAction === 'remove') removeFromCart(id);
  });

  elements.checkoutButton.addEventListener('click', openCheckout);
  elements.closeCheckoutButton.addEventListener('click', closeCheckout);
  elements.checkoutModal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-modal]')) closeCheckout();
  });
  elements.checkoutForm.addEventListener('submit', handleCheckoutSubmit);

  elements.closeProductDetailsButton.addEventListener('click', closeProductDetails);
  elements.productDetailsModal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-product-details]')) closeProductDetails();
  });

  elements.successDoneButton.addEventListener('click', closeSuccess);
  elements.successModal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-success]')) closeSuccess();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      if (mobile) {
        elements.mobileSearchRow.hidden = false;
        elements.mobileSearchInput.focus();
      } else {
        elements.searchInput.focus();
      }
    }
    if (event.key === 'Escape') {
      if (!elements.successModal.hidden) closeSuccess();
      else if (!elements.checkoutModal.hidden) closeCheckout();
      else if (!elements.productDetailsModal.hidden) closeProductDetails();
      else if (elements.cartDrawer.classList.contains('open')) closeCart();
      if (!elements.mobileSearchRow.hidden) elements.mobileSearchRow.hidden = true;
    }
  });

  elements.newsletterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.newsletterForm.reportValidity()) return;
    const emailInput = document.getElementById('newsletterEmail');
    try {
      const result = await requestJson('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value.trim() })
      });
      showToast(result.message || 'Вы подписались на рассылку.');
      elements.newsletterForm.reset();
    } catch (error) {
      showToast(error.message || 'Не удалось оформить подписку.', 'error');
    }
  });
}

// ============================================
// Запуск приложения
// ============================================

async function init() {
  document.getElementById('currentYear').textContent = String(new Date().getFullYear());
  initEvents();
  renderCart();
  await loadProducts();
}

init();


