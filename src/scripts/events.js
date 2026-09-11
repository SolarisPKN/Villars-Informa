import { argentinaDateKey, eventBucket } from '../utils/events.js';

function sortCards(container, direction) {
  const cards = [...container.querySelectorAll('[data-event-card]')];
  cards.sort((left, right) => direction * String(left.dataset.eventStart).localeCompare(String(right.dataset.eventStart)));
  container.append(...cards);
}

function classifyEvents() {
  const upcoming = document.querySelector('[data-event-list="upcoming"]');
  const past = document.querySelector('[data-event-list="past"]');
  if (!(upcoming instanceof HTMLElement) || !(past instanceof HTMLElement)) return;
  const today = argentinaDateKey();
  const cards = [...document.querySelectorAll('[data-event-card]')];
  for (const card of cards) {
    const bucket = eventBucket({ start: card.dataset.eventStart, end: card.dataset.eventEnd }, today);
    card.classList.toggle('is-past', bucket === 'past');
    (bucket === 'past' ? past : upcoming).append(card);
  }
  sortCards(upcoming, 1);
  sortCards(past, -1);
  const upcomingEmpty = document.querySelector('[data-event-empty="upcoming"]');
  const pastEmpty = document.querySelector('[data-event-empty="past"]');
  if (upcomingEmpty instanceof HTMLElement) upcomingEmpty.hidden = upcoming.children.length > 0;
  if (pastEmpty instanceof HTMLElement) pastEmpty.hidden = past.children.length > 0;
}

document.addEventListener('astro:page-load', classifyEvents);
