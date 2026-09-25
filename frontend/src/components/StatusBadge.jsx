const COLORS = {
  REQUESTED: '#9ca3af',
  MATCHED: '#3b82f6',
  DRIVER_ARRIVED: '#a855f7',
  STARTED: '#f59e0b',
  COMPLETED: '#16a34a',
  CANCELLED: '#ef4444',
  ONLINE: '#16a34a',
  OFFLINE: '#9ca3af',
};

export default function StatusBadge({ status }) {
  const color = COLORS[status] || '#6b7280';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: color,
        letterSpacing: 0.3,
      }}
    >
      {status}
    </span>
  );
}
