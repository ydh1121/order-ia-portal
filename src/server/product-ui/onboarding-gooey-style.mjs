// The real notification button and its two actions share one filtered SVG surface.
export const onboardingGooeyCss = `
.ob .pm-gooey-menu {
  --pm-gooey-ink: #fff;
  --pm-gooey-surface: var(--ob-ink, #20272b);
  --pm-gooey-unread: #fc0;
}
.ob .pm-gooey-menu .pm-gooey-surface {
  fill: var(--pm-gooey-surface);
  filter: drop-shadow(0 3px 8px #20272b24);
}
.ob .pm-gooey-menu > .pm-gooey-trigger,
.ob .pm-gooey-menu .pm-gooey-action { color: var(--pm-gooey-ink); }
.ob .pm-gooey-menu .quick-unread:not(.t-badge),
.ob .pm-gooey-menu .t-badge-dot {
  background: var(--pm-gooey-unread);
  color: var(--pm-gooey-surface);
}
.ob .pm-gooey-menu :is(.pm-gooey-trigger, .pm-gooey-action):focus-visible {
  outline-color: var(--ob-blue, #315de6);
}
`;
