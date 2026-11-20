export type OrderIconName =
  'shirt' | 'calendar' | 'price' | 'workshop' | 'check' | 'clock' | 'arrow' | 'refresh' | 'info';

const paths: Record<OrderIconName, string[]> = {
  shirt: ['M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-1 3-7 3-8 0Z'],
  calendar: ['M4 5h16v16H4z', 'M7 3v4m10-4v4M4 10h16'],
  price: ['M4 4h16v16H4z', 'M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12'],
  workshop: ['M3 21V9l6 3V7l6 4V3h5v18Z', 'M6 17h1m4 0h1m4 0h1'],
  check: ['m5 12 4 4L19 6'],
  clock: ['M12 8v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  arrow: ['m14 6-6 6 6 6', 'M8 12h12'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3'],
  info: ['M12 11v6m0-10h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
};

export function OrderIcon({ name }: { name: OrderIconName }) {
  return (
    <svg
      className="pa-order-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
