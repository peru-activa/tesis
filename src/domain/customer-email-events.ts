export const customerEmailKinds = [
  'request_received',
  'quotation_issued',
  'order_confirmed',
  'order_ready',
] as const;
export type CustomerEmailKind = (typeof customerEmailKinds)[number];
export const customerEmailEventOrder = Object.fromEntries(
  customerEmailKinds.map((kind, index) => [kind, index]),
) as Record<CustomerEmailKind, number>;
