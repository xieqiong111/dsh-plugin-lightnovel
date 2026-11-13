import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/common/Toast'
import { DashboardPage } from '@/pages/DashboardPage'
import { SearchPage } from '@/pages/SearchPage'
import { NovelDetailPage } from '@/pages/NovelDetailPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { TasksPage } from '@/pages/TasksPage'
import { SourcesPage } from '@/pages/SourcesPage'
import { AutoUpdatePage } from '@/pages/AutoUpdatePage'
import { StatsPage } from '@/pages/StatsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/novel/:id" element={<NovelDetailPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/auto-update" element={<AutoUpdatePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  )
}
