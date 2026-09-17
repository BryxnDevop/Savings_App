import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './lib/theme';
import { I18nProvider, useI18n } from './lib/i18n';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <FatalError />;
    return this.props.children;
  }
}
function FatalError() { const { t } = useI18n(); return <main className="fatal-error"><img src="./icons/logo.svg" width="64" height="64" alt="Ahorra+" /><h1>{t('No pudimos abrir esta vista','We could not open this view')}</h1><p>{t('Recarga la app. Tus datos guardados permanecen en Supabase.','Reload the app. Your saved data remains in Supabase.')}</p><button className="button primary" onClick={() => location.reload()}>{t('Volver a abrir','Open again')}</button></main>; }
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><ThemeProvider><ErrorBoundary><App /></ErrorBoundary></ThemeProvider></I18nProvider></React.StrictMode>);
