import { useState } from 'react';
import { Sidebar, Page } from '../components/Sidebar';
import { UsersPage } from './UsersPage';
import { StatisticsPage } from './StatisticsPage';
import { BroadcastPage } from './BroadcastPage';
import { TextsPage } from './TextsPage';

interface DashboardPageProps {
  onLogout: () => void;
}

/** Renders the correct page content based on current navigation */
function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'users':
      return <UsersPage />;
    case 'statistics':
      return <StatisticsPage />;
    case 'broadcast':
      return <BroadcastPage />;
    case 'texts':
      return <TextsPage />;
    case 'dashboard':
    default:
      return (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h2>
          <p className="text-gray-500">Welcome to the bot control panel.</p>
        </div>
      );
  }
}

export function DashboardPage({ onLogout }: DashboardPageProps) {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4 flex justify-end">
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
        <main className="flex-1 px-6 py-8">
          <PageContent page={currentPage} />
        </main>
      </div>
    </div>
  );
}
