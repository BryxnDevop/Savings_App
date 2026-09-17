import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from './api';
export function usePlanning(revision,userId){
 const [schedules,setSchedules]=useState(null),[notifications,setNotifications]=useState(null),[failure,setFailure]=useState(null);
 const sequence=useRef(0),alive=useRef(true);
 const refresh=useCallback(async()=>{
  const current=++sequence.current;
  try{const [s,n]=await Promise.all([api('/recurring'),api('/notifications')]);if(alive.current&&current===sequence.current){setSchedules(s);setNotifications(n);setFailure(null);}return true;}
  catch(e){if(alive.current&&current===sequence.current)setFailure(e);return false;}
 },[userId]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
 useEffect(()=>{refresh();},[refresh,revision]);
 useEffect(()=>{const poll=()=>{if(!document.hidden)refresh();};const timer=setInterval(poll,60000);window.addEventListener('focus',poll);return()=>{clearInterval(timer);window.removeEventListener('focus',poll);};},[refresh]);
 return {schedules,notifications,failure,refresh};
}
