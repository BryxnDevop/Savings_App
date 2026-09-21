import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from './api';
import { armNotificationSound, playNotificationSound } from './notificationSound';
export function usePlanning(revision,userId){
 const [schedules,setSchedules]=useState(null),[notifications,setNotifications]=useState(null),[failure,setFailure]=useState(null);
 const sequence=useRef(0),alive=useRef(true),seenNoticeIds=useRef(null);
 const refresh=useCallback(async()=>{
  const current=++sequence.current;
  try{const [s,n]=await Promise.all([api('/recurring'),api('/notifications')]);if(alive.current&&current===sequence.current){const ids=new Set(n.items?.map(item=>item.id)||[]);const hasNewUnread=seenNoticeIds.current&&n.items?.some(item=>!item.read_at&&!seenNoticeIds.current.has(item.id));if(hasNewUnread&&n.sound!==false&&!document.hidden)playNotificationSound();seenNoticeIds.current=ids;setSchedules(s);setNotifications(n);setFailure(null);}return true;}
  catch(e){if(alive.current&&current===sequence.current)setFailure(e);return false;}
 },[userId]);
 useEffect(()=>{alive.current=true;const disarm=armNotificationSound();return()=>{alive.current=false;sequence.current++;disarm();};},[]);
 useEffect(()=>{refresh();},[refresh,revision]);
 useEffect(()=>{const poll=()=>{if(!document.hidden)refresh();};const timer=setInterval(poll,60000);window.addEventListener('focus',poll);return()=>{clearInterval(timer);window.removeEventListener('focus',poll);};},[refresh]);
 return {schedules,notifications,failure,refresh};
}
