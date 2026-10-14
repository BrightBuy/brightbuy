const COLORS = {
  black: '#202124',
  white: '#f8f8f5',
  silver: '#b9bdc4',
  blue: '#3568aa',
  coral: '#ea8a80',
  obsidian: '#242528',
  green: '#5e7b62',
  purple: '#896aa7',
  red: '#bc4041',
  charcoal: '#414448',
  'glacier white': '#edf1f1',
  pink: '#e6a6ba',
  grey: '#818991',
  gray: '#818991',
  graphite: '#50555b',
  gold: '#c9ad70',
  orange: '#e9893f',
  'space grey': '#747b82',
  navy: '#26364e',
  sage: '#a0b29b',
  sand: '#d5c4a3',
};
export function colorStyle(value) {
  const parts = String(value || '')
    .toLowerCase()
    .split(/\s*\/\s*/);
  if (parts.some((part) => !COLORS[part])) return null;
  return parts.length === 1
    ? COLORS[parts[0]]
    : 'linear-gradient(135deg,' +
        parts
          .map(
            (part, i) =>
              COLORS[part] +
              ' ' +
              (i * 100) / parts.length +
              '% ' +
              ((i + 1) * 100) / parts.length +
              '%',
          )
          .join(',') +
        ')';
}
export function variantColor(variant) {
  const attribute = variant?.attributeValues?.find((a) =>
    /^(color|colour)$/i.test(a.name || a.attributeName || ''),
  );
  if (attribute) return attribute.value;
  const name = variant?.name || '';
  if (/^(Black \/ Red|White \/ Blue)$/i.test(name)) return name;
  return (
    Object.keys(COLORS)
      .sort((a, b) => b.length - a.length)
      .find(
        (c) =>
          name.toLowerCase() === c ||
          name.toLowerCase().startsWith(c + ' /') ||
          name.toLowerCase().startsWith(c + ' body'),
      ) || null
  );
}
export function variantConfiguration(variant) {
  const attrs = (variant?.attributeValues || []).filter(
    (a) => !/^(color|colour)$/i.test(a.name || a.attributeName || ''),
  );
  if (attrs.length)
    return attrs
      .map((a) => ({ id: a.attributeId || a.name, value: a.value }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((a) => a.value)
      .join(' / ');
  const color = variantColor(variant);
  return color
    ? (variant.name || '')
        .replace(
          new RegExp(
            '^' + color.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '(?:\\s*/\\s*|\\s+|$)',
            'i',
          ),
          '',
        )
        .trim()
    : variant?.name || '';
}
