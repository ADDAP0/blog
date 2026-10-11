/* ========== 卡片延迟收起 + 定位 ========== */
const brandWrap   = document.querySelector('.nav-brand-wrap');
const profileCard = document.querySelector('.profile-card');
let hideTimer = null;

function positionCard() {
  if (!brandWrap || !profileCard) return;
  const rect = brandWrap.getBoundingClientRect();
  profileCard.style.top  = (rect.bottom + 22) + 'px';
  profileCard.style.left = rect.left + 'px';
}

function showCard() {
  clearTimeout(hideTimer);
  positionCard();
  profileCard.classList.add('is-open');
}

function hideCard() {
  hideTimer = setTimeout(() => profileCard.classList.remove('is-open'), 500);
}

if (brandWrap && profileCard) {
  brandWrap.addEventListener('mouseenter', showCard);
  brandWrap.addEventListener('mouseleave', hideCard);
  profileCard.addEventListener('mouseenter', showCard);
  profileCard.addEventListener('mouseleave', hideCard);
  window.addEventListener('resize', () => {
    if (profileCard.classList.contains('is-open')) positionCard();
  });
}