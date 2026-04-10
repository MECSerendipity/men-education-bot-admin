export const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Expired: 'bg-gray-100 text-gray-500',
  Cancelled: 'bg-orange-100 text-orange-600',
  Approved: 'bg-green-100 text-green-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Declined: 'bg-red-100 text-red-600',
  WaitingConfirmation: 'bg-blue-100 text-blue-700',
};

export const METHOD_STYLES: Record<string, string> = {
  card: 'bg-purple-100 text-purple-700',
  crypto: 'bg-orange-100 text-orange-700',
};
