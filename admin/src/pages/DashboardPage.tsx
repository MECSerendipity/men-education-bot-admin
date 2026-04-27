import { useState } from 'react';
import { Sidebar, Page } from '../components/Sidebar';
import { UsersPage } from './UsersPage';
import { SubscriptionsPage } from './SubscriptionsPage';
import { TransactionsPage } from './TransactionsPage';
import { StatisticsPage } from './StatisticsPage';
import { BroadcastPage } from './BroadcastPage';
import { TextsPage } from './TextsPage';
import { PricesPage } from './PricesPage';
import { LogsPage } from './LogsPage';
import { PartnersPage } from './PartnersPage';

const JOBS = [
  {
    name: 'Auto-Renewal (Card)',
    description: 'Автоматичне зняття оплати з картки. Починає за 2 дні до закінчення підписки (наприклад, якщо підписка до 30-го, джоба ходить 28, 29 і 30).',
    schedule: 'Щодня о 09:00 та 15:00 UTC (12:00 та 18:00 Kyiv)',
    color: 'blue',
    icon: '\u{1F4B3}',
  },
  {
    name: 'Crypto Reminder',
    description: 'Нагадування юзерам з USDT підпискою оплатити вручну. Починає за 2 дні до закінчення підписки (як і картка).',
    schedule: 'Щодня о 09:00 та 15:00 UTC (12:00 та 18:00 Kyiv)',
    color: 'purple',
    icon: '\u{26A1}',
  },
  {
    name: 'Expire Subscriptions',
    description: 'Кікає юзерів у яких підписка вже прострочена (expires_at в минулому). Кік з каналів, відкликання посилань, зміна статусу на Expired.',
    schedule: 'Щодня о 07:00 UTC (10:00 Kyiv)',
    color: 'red',
    icon: '\u{1F6AB}',
  },
  {
    name: 'Pending Transactions Check',
    description: 'Страхувальна джоба. Посилання на оплату живе 30 хвилин. Якщо юзер оплатив, але callback від WayForPay не прийшов — ця джоба кожні 5 хвилин перевіряє Pending транзакції старіші 30 хвилин через WayForPay API. Якщо оплата пройшла — активує підписку. Якщо ні — закриває транзакцію.',
    schedule: 'Кожні 5 хвилин (перевіряє транзакції старіші 30 хв)',
    color: 'amber',
    icon: '\u{1F50D}',
  },
  {
    name: 'Cleanup',
    description: 'Видалення старих системних логів (старіших за 30 днів).',
    schedule: 'Щодня о 03:00 UTC (06:00 Kyiv)',
    color: 'gray',
    icon: '\u{1F9F9}',
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'bg-blue-100',   badge: 'bg-blue-100 text-blue-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'bg-purple-100', badge: 'bg-purple-100 text-purple-700' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'bg-red-100',    badge: 'bg-red-100 text-red-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'bg-amber-100',  badge: 'bg-amber-100 text-amber-700' },
  gray:   { bg: 'bg-gray-50',   border: 'border-gray-200',   icon: 'bg-gray-100',   badge: 'bg-gray-100 text-gray-600' },
};

function DashboardHome() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h2>
      <p className="text-sm text-gray-500 mb-6">Bot control panel</p>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Scheduled Jobs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {JOBS.map((job) => {
            const c = COLOR_MAP[job.color] ?? COLOR_MAP.gray;
            return (
              <div key={job.name} className={`${c.bg} border ${c.border} rounded-xl p-4`}>
                <div className="flex items-start gap-3">
                  <div className={`${c.icon} w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0`}>
                    {job.icon}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900">{job.name}</h4>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{job.description}</p>
                    <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>
                      {job.schedule}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface DashboardPageProps {
  onLogout: () => void;
}

/** Renders the correct page content based on current navigation */
function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'users':
      return <UsersPage />;
    case 'subscriptions':
      return <SubscriptionsPage />;
    case 'transactions':
      return <TransactionsPage />;
    case 'prices':
      return <PricesPage />;
    case 'statistics':
      return <StatisticsPage />;
    case 'broadcast':
      return <BroadcastPage />;
    case 'texts':
      return <TextsPage />;
    case 'partners':
      return <PartnersPage />;
    case 'logs':
      return <LogsPage />;
    case 'dashboard':
    default:
      return <DashboardHome />;
  }
}

export function DashboardPage({ onLogout }: DashboardPageProps) {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-2 flex justify-end">
            <button
              onClick={onLogout}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900
                         hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 flex flex-col overflow-auto px-6 py-4">
          <PageContent page={currentPage} />
        </main>
      </div>
    </div>
  );
}
