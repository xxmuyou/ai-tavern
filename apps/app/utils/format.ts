export function formatDateTime(value: number | null | undefined): string {
  if (!value) {
    return 'Not yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not yet';
  }

  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatProvider(provider: string): string {
  if (provider === 'google') {
    return 'Google';
  }
  if (provider === 'email') {
    return 'Email Magic Link';
  }
  return provider.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatLevel(level: string | null | undefined): string {
  return level || 'New';
}
