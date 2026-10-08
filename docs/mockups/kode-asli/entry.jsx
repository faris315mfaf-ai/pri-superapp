// Pratinjau komponen produksi dan eksperimen Faris, dengan layanan contoh lokal.
import './fixtures.js';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BerandaFaris } from '@/features/beranda/beranda-faris';
import { BerandaSimpelGlass } from '@/features/beranda/beranda-simpel-glass';
import { DashboardScreen } from '@/features/dashboard/dashboard-screen';
import { TvrKuScreen } from '@/features/tvr-ku/tvrku-screen';
import { TvScreen } from '@/features/tv-rakyat/tv-screen';
import { SideNav } from '@/components/side-nav';
import { BottomNav } from '@/components/bottom-nav';
import { Dock } from '@/components/dock';
import { MeshBackground } from '@/components/mesh-background';
import { ToastViewport } from '@/components/toast-viewport';
import { useAppStore, toast } from '@/hooks/use-app-store';
import { useLatarApple, temaApple } from '@/hooks/use-latar-apple';
import { useModeNav } from '@/hooks/use-mode-nav';
import { KonteksTabAktif } from '@/hooks/use-tab-aktif';

const user={id:'176',nama:'M. Faris Ahlul',nama_panggilan:'Faris',email:'mockup@example.invalid',role:'anggota',avatar_url:'',jabatan:'',divisi:'Divisi TV Rakyat',posisi_divisi:'anggota',username:'faris',wa_terverifikasi:true};
const masterUser={...user,id:'mockup-master',username:'contoh-master',role:'master'};
useAppStore.setState({user,tema:'light',tvAnggota:true,wewenangTv:{anggota:true,acc:true,upload:true,proses:true},sakelar:{fitur:{pet_beranda:false,juara_efek:false,asisten:false},modul:{kepatuhan_komen:true},hemat:false},hadir:[],notifikasi:[],notifikasiSiap:true});
const tabs=['beranda','tv','tvrku'];
const screens=['beranda','lama','master','tv','tvrku'];
function info(){toast('info','Pratinjau tampilan','Data contoh lokal. Aksi ini tidak dijalankan ke server.');}
class ErrorBoundary extends React.Component{state={error:null};static getDerivedStateFromError(error){return{error}}render(){return this.state.error?<div style={{padding:30,color:'crimson',background:'white'}}>Pratinjau gagal: {this.state.error.message}</div>:this.props.children}}
function App(){
 const [tab,setTab]=useState('beranda');
 useEffect(()=>{useAppStore.setState({user:tab==='master'?masterUser:user})},[tab]);
 const [fokus,setFokus]=useState(null);
 const [latar,aturLatar]=useLatarApple();
 const [mode,aturMode]=useModeNav();
 const tema=useAppStore(s=>s.tema);
 useEffect(()=>{const timer=setTimeout(()=>window.dispatchEvent(new Event('pri:segarkan')),250);return()=>clearTimeout(timer)},[tab]);
 const apple=temaApple(latar),dock=apple&&mode==='dock';
 useEffect(()=>{document.documentElement.classList.toggle('dark',tema==='dark');document.documentElement.dataset.desain=apple?'apple':'';document.documentElement.dataset.nav=dock?'dock':'';document.documentElement.dataset.layar=tab;},[tema,apple,dock,tab]);
 useEffect(()=>{const receive=e=>{if(e.origin!==location.origin||e.source!==parent)return;const {type,value}=e.data??{};if(type==='theme'&&['classic','pagi','sore','malam'].includes(value)){aturLatar(value);useAppStore.getState().setTema(value==='malam'?'dark':'light')}if(type==='screen'&&screens.includes(value)){setTab(value);window.scrollTo(0,0)}if(type==='nav'&&['sidebar','dock'].includes(value))aturMode(value)};window.addEventListener('message',receive);parent.postMessage({type:'preview-ready'},location.origin);return()=>window.removeEventListener('message',receive)},[aturLatar,aturMode]);
 const onTab=t=>{setTab(t);window.scrollTo(0,0);parent.postMessage({type:'screen-changed',value:t},location.origin)};
 const nav={role:user.role,tabAktif:tab,onTab,belumBaca:3,tabs};
 return <><MeshBackground/><div className="relative min-h-dvh">{dock?<Dock {...nav} onJadikanSidebar={()=>aturMode('sidebar')}/>:<SideNav {...nav} apple={apple} onJadikanDock={()=>aturMode('dock')}/>}<div className={dock?'relative':apple?'relative lg:pl-[264px]':'relative lg:pl-60'}><KonteksTabAktif.Provider value={true}><ErrorBoundary key={tab}>{tab==='beranda'?<BerandaFaris user={user} onBukaNotifikasi={info} onBukaAbsensi={info} onBukaLaporanKerja={info} onBukaProfil={info} onBukaPengumuman={info} onBukaKonten={info} onBukaTv={()=>onTab('tv')} onBukaTvrKu={seksi=>{setFokus({seksi,tik:Date.now()});onTab('tvrku')}}/>:tab==='lama'?<BerandaSimpelGlass user={user} onBukaNotifikasi={info} onBukaAbsensi={info} onBukaKonten={info} onBukaProfil={info} onBukaPengumuman={info} onBukaLeaderboard={info} onBukaTvrKu={()=>onTab('tvrku')}/>:tab==='master'?<DashboardScreen user={masterUser} jumlahBelumBaca={3} onBukaNotifikasi={info} onBukaModulTv={()=>onTab('tv')} onBukaModulQc={info} onBukaKelolaPengguna={info} onBukaAbsensi={info} onBukaKpiVideo={info} onBukaTvNasional={info} onBukaKepatuhan={info} onBukaTvAnalitik={info}/>:tab==='tv'?<TvScreen user={user} onBukaNotifikasi={info}/>:<TvrKuScreen user={user} onBukaNotifikasi={info} gulirKe={fokus}/>}</ErrorBoundary></KonteksTabAktif.Provider></div><BottomNav {...nav} apple={apple}/></div><ToastViewport/></>;
}
createRoot(document.getElementById('root')).render(<App/>);
