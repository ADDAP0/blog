/* ========== 幻灯片背景 ========== */
const images = [
  SITE_ROOT + "images/1.jpg",
  SITE_ROOT + "images/2.jpg",
  SITE_ROOT + "images/3.jpg",
  SITE_ROOT + "images/4.jpg"
];

const INTERVAL = 8000;

const slideshow = document.getElementById('slideshow');
let current = 0;
let timer = null;

if (slideshow) {
  images.forEach((src, i) => {
    const slide = document.createElement('div');
    slide.className = 'slide' + (i === 0 ? ' active' : '');
    slide.style.backgroundImage = `url(${src})`;
    slideshow.appendChild(slide);
  });
}

const slides = document.querySelectorAll('.slide');

function goTo(index) {
  if (!slides.length) return;
  slides[current]?.classList.remove('active');
  current = (index + slides.length) % slides.length;
  slides[current].classList.add('active');
  resetTimer();
}

function next() {
  if (!slides.length) return;
  goTo(current + 1);
}

function resetTimer() {
  if (!slides.length) return;
  clearInterval(timer);
  timer = setInterval(next, INTERVAL);
}

if (slides.length) resetTimer();