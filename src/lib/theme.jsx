import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useI18n } from './i18n';
import { Icon } from '../components/Icon';
const ThemeContext=createContext(null);
export function ThemeProvider({children}) {
  const [theme,setTheme]=useState(()=>{try{return ['light','dark','system'].includes(localStorage.getItem('ahorra_theme'))?localStorage.getItem('ahorra_theme'):'light';}catch{return 'light';}});
  const [authenticated,setAuthenticated]=useState(false);
  useLayoutEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    function apply(){const dark=authenticated&&(theme==='dark'||(theme==='system'&&media.matches));document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101b17':'#ffffff');}
    apply();try{localStorage.setItem('ahorra_theme',theme);}catch{}media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[theme,authenticated]);
  return <ThemeContext.Provider value={{theme,setTheme,setAuthenticated}}>{children}</ThemeContext.Provider>;
}
export function ThemePicker(){const {theme,setTheme}=useContext(ThemeContext);const {t}=useI18n();return <fieldset className="theme-picker"><legend>{t('Apariencia','Appearance')}</legend><div>{[['light','sun',t('Claro','Light')],['dark','moon',t('Oscuro','Dark')],['system','monitor',t('Sistema','System')]].map(([value,icon,label])=><button type="button" key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)}><Icon name={icon} size={19}/>{label}</button>)}</div><p className="hint">{t('Se recuerda en este dispositivo.','Remembered on this device.')}</p></fieldset>;}

export const useTheme = () => useContext(ThemeContext);
