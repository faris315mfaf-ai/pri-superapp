import contohThumbnail from '../../../public/tur/template-hasil.svg';
// Semua fetch dijawab di memori. Tidak membaca .env, token, atau database.
// CSP connect-src 'none' di app.html menutup transport jaringan lainnya.
const now=new Date().toISOString(),today=now.slice(0,10),seconds=Date.now()/1000;
const platforms=['instagram','tiktok','youtube','facebook','threads','twitter'];
const accounts=platforms.map((platform,i)=>({id:String(i),platform,username:'tvr.contoh',aktif:true,terhubung:true}));
const pref={latar:'pagi'};
localStorage.setItem('pri:latar','pagi');
localStorage.setItem('pri:mode-nav','sidebar');
const metrik={pengikut:12480,tayangan:248600,jangkauan:162400,suka:16400,komentar:2840,bagikan:1280};
const stok=['Kegiatan masyarakat di Jakarta','Berita hari ini — TV Rakyat','Cerita warga untuk Indonesia'].map((judul,i)=>({id:`contoh-${i}`,judul,tanggal:seconds-i*3600,durasi:48+i*7,size:(18+i*4)*1048576,size_awal:60*1048576,hemat_persen:70-i*7,vmaf:90.2,sumber:'render',terunggah:i===2?seconds-800:null}));
const ringkas={stok,job:null,jobs:[],antrean:null,maks_stok:50,maks_job_aktif:20,kuota:{dipakai_mb:680,batas_mb:2048},template:{ada:true,siap:true,slot:Object.fromEntries(['kotak','boom','bingkai','penutup'].map(s=>[s,{ada:s==='kotak'||s==='bingkai',draf:false,jenis:'gambar'}])),text_box:{x:60,y:1350,w:960,h:360},badge_box:null,badge_box_default:null,kategori:'NEWS',rata:'justify',teks_warna:'white',diperbarui:seconds},batas:{maks_aset_mb:100,maks_gif_mb:50,maks_sumber_mb:100,maks_animasi_detik:30,maks_durasi_detik:600,maks_hook:300,maks_sumber_teks:10000,maks_kategori:30,jenis_slot:{kotak:['.png'],boom:['.png','.mp4'],bingkai:['.png'],penutup:['.mp4']},jenis_sumber:['.mp4','.mov'],umur_simpan_jam:48}};
const videos=Array.from({length:30},(_,i)=>({id:`v-${i}`,judul:['Kegiatan masyarakat di Jakarta','Berita daerah hari ini','Cerita warga untuk Indonesia'][i%3],link:'',jenis:'MANUAL',video_asli:'',caption_asli:'Data contoh',judul_overlay:'TV RAKYAT',highlight:'Data contoh lokal',status:i<24?'SUDAH DIPROSES':i<27?'SEDANG DIPROSES':i<29?'MENUNGGU DOKSLI':'GAGAL',link_instagram:'',thumbnail_url:'',jam_tanggal:new Date(Date.now()-i*3600000).toISOString(),platform_terunggah:i<24?['instagram','tiktok']:[]}));
const keyword=[{id:'contoh-1',keyword:'Kegiatan Masyarakat',aktif:true,selesai:false,dibuat_pada:now},{id:'contoh-2',keyword:'Berita Daerah',aktif:true,selesai:false,dibuat_pada:now}];
function data(path,q){
 if(path==='/api/preferensi')return{preferensi:pref};
 if(path==='/api/dashboard')return{kpi:[],tren:[],kepatuhanAkun:[],aktivitas:[],peringkat:[],ringkasanVideo:{'SUDAH DIPROSES':24,'SEDANG DIPROSES':3,'MENUNGGU DOKSLI':2,GAGAL:1},ringkasan:{total_postingan:86,kader_patuh:'128',perlu_ditindak:14,persen_kepatuhan:92}};
 if(path==='/api/dashboard/ringkas')return{periode:today,tanggal:today,komen:{persen:94,kader_aktif:128,total_kader:142,diperbarui:now},absensi:{hadir:128,total:142},kerja:{sudah_lapor:120,total:142,rata:88},video:{tercapai:32,total:142,video_hari_ini:86}};
 if(path==='/api/dashboard/tv-nasional')return{indikator:Object.keys(metrik),platforms,total:Object.fromEntries(Object.entries(metrik).map(([k,v])=>[k,v*18])),per_platform:Object.fromEntries(platforms.map(p=>[p,{official:metrik,pengguna:Object.fromEntries(Object.entries(metrik).map(([k,v])=>[k,v*2])),total:Object.fromEntries(Object.entries(metrik).map(([k,v])=>[k,v*3])),akun_terbaca:64}])),akun_terhubung:{total:390,orang:64,per_platform:Object.fromEntries(platforms.map(p=>[p,{pengguna:64,official:true}]))},anggota:[],cakupan:{profil_total:64,profil_terbaca:64,official_terbaca:6,catatan:'Data contoh untuk pratinjau'}};
 if(path==='/api/streak')return{hari:7,restore_tersedia:false};
 if(path==='/api/absensi')return{tanggal_hari_ini:today,data:[{user_id:'176',tanggal_wib:today,jenis:'masuk',waktu:today+'T01:03:00Z'}],sadar:{siap:true}};
 if(path==='/api/rekap')return{total:10,sudah:8,diperbarui:now};
 if(path==='/api/koin')return{saldo:2450,boleh_kelola:false,riwayat:[{id:'1',jumlah:250,label:'Apresiasi video',catatan:'Data contoh',tanggal:now}]};
 if(path==='/api/pengumuman')return{cakupan_boleh:['semua'],jabatan_pilihan:[],data:[{id:'contoh',pengirim_nama:'Pengurus PRI',judul:'Koordinasi kegiatan bersama masyarakat',isi:'Siapkan materi publikasi dan dokumentasi kegiatan melalui TV Rakyat. Ini adalah pengumuman contoh untuk pratinjau tampilan.',cakupan:'semua',jabatan_target:null,jumlah_penerima:142,dibuat_pada:now,dari_saya:false}]};
 if(path==='/api/autoedit/tvr/ringkas'||path==='/api/autoedit/tvr/stok')return ringkas;
 if(path==='/api/autoedit/tvr/jobs/saya')return{jobs:[],stok};
 if(path==='/api/autoedit/tvr/template')return ringkas.template;
 if(path==='/api/autoedit/tvr/kompres')return{kompres:[],maks_mb:1024};
 if(path==='/api/autoedit/tvr/blur')return{blur:[],maks_mb:100};
 if(path==='/api/tvr/rangkuman')return{nama:'Faris (Contoh)',tanggal:today,per_platform:Object.fromEntries(platforms.map(p=>[p,[]])),jumlah:0,menunggu:[]};
 if(path==='/api/tvr/insight-saya')return{siap:true,profil:'contoh',insight:{},diperbarui_pada:now};
 if(path==='/api/autoedit/video/info')return{worker_aktif:true,kuota:{dipakai_mb:680,batas_mb:2048,persen:33},templates:[],jobs:[]};
 if(path==='/api/tvr/akun')return{data:accounts};
 if(path==='/api/tvr/hubungkan')return{terhubung:accounts,tersinkron:6,konflik:[],jumlah_terhubung:6,status:accounts.map(a=>({...a,keadaan:'terhubung'}))};
 if(path==='/api/tvr/laporan')return q.has('riwayat')?{data:Array.from({length:7},(_,i)=>({tanggal:new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10),jumlah:18+i*2})),kpi_target:30}:{tanggal:today,hari_ini:today,data:Array.from({length:24},(_,i)=>({id:String(i),platform:platforms[i%6],link:"",tanggal:today,dibuat_pada:now,jam_tanggal:now,waktu:now})),kpi_target:30,kpi_persen:80,kpi_tercapai:false,per_platform:platforms.map(platform=>({platform,jumlah:4,target:5,persen:80})),dibebaskan:null,unggahan:[]};
 if(path==='/api/laporan-kerja')return{tanggal:today,hari_ini:today,data:[],kpi:{rencana_total:5,rencana_selesai:4,rencana_gagal:0,rencana_belum_lapor:1,tambahan_total:1,kpi_persen:80}};
 if(path==='/api/tv/keyword')return{data:keyword,boleh_kelola:true};
 if(path==='/api/video-antrian')return{data:videos,ringkasan:{'SUDAH DIPROSES':24,'SEDANG DIPROSES':3,'MENUNGGU DOKSLI':2,GAGAL:1}};
 if(path==='/api/tv/video-wajib')return{data:[{id:'wajib-contoh',judul:'Dokumentasi kegiatan masyarakat',keterangan:'Siapkan video kegiatan wilayah Anda. Ini adalah tugas contoh dalam pratinjau.',link_doksli:'',sumber_video:'Dokumentasi wilayah',kategori:'Kegiatan Masyarakat',batas_waktu:new Date(Date.now()+86400000).toISOString(),aktif:true,dibuat_pada:now,berkas_url:'',berkas_nama:'',berkas_ukuran:0}],boleh:false};
 if(path==='/api/tvr/unggah')return{siap:true,platforms:accounts,terhubung:platforms,data:[],jadwal:[]};
 if(path==='/api/tvr/kendali')return{data:[],daftar:[],anggota:[]};
 if(path==='/api/tv/insight')return{siap:true,data:[],platforms:[],diperbarui:now};
 if(path==='/api/pengguna')return{data:[],ringkasan:{total:142,aktif:128,menunggu:5,ditolak:0},total:142};
 if(path==='/api/ping')return{ok:true};
 return{data:[],daftar:[],anggota:[],jobs:[],total:0,siap:true,boleh:true,boleh_kelola:true,ringkasan:{},status:{},jadwal:[]};
}
const seen=new Set();
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);
 const method=(init.method||(typeof input==='object'&&input.method)||'GET').toUpperCase();
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return json({error:'Pratinjau lokal: permintaan jaringan tidak tersedia.'},403);
 if(method==='GET'&&url.pathname.endsWith('/thumb'))return new Response(contohThumbnail,{headers:{'Content-Type':'image/svg+xml'}});
 if(method!=='GET'){
  if(url.pathname==='/api/preferensi'){const {kunci,nilai}=JSON.parse(init.body||'{}');pref[kunci]=nilai;return json({ok:true})}
  return json({error:'Mode pratinjau: perubahan data dan unggahan tidak dijalankan.'},403);
 }
 if(!seen.has(url.pathname)){seen.add(url.pathname);console.info('[Mockup fixture]',url.pathname)}
 if(url.pathname.endsWith('/berkas'))return json({error:'Berkas video contoh tidak disertakan dalam mockup.'},403);
 const result=data(url.pathname,url.searchParams);
 if(new Headers(init.headers).get('X-Autoedit-Tim')==='tv'&&url.pathname.startsWith('/api/autoedit/tvr/')&&result===ringkas)return json({...ringkas,maks_stok:150,maks_job_aktif:60,kuota:{dipakai_mb:680,batas_mb:5120}});
 return json(result);
};
