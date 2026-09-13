'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan } from '@/lib/usePengaturan';

const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };

// Palet brand JM Travel — navy dari Kop surat yang udah ada, emas dari
// aksen kuning di materi Canva asli (org chart, poster penutup).
const NAVY_DEEP = '#0E2F6E';
const NAVY_MID = '#1A4FA0';
const GOLD = '#F4C430';
const GOLD_DEEP = '#C9952A';
const CREAM = '#FBF8F0';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

// Field JSON bisa balik sebagai string atau array tergantung driver — samain
// dulu, sama pola kayak parseItinerary di program/[id]/page.jsx.
function parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}
function bullets(text) {
  return (text || '').split('\n').map(s => s.trim()).filter(Boolean);
}

const th = { border: `1px solid ${NAVY_DEEP}`, padding: '5px 8px', background: NAVY_DEEP, color: '#fff', textAlign: 'left', fontSize: 10.5 };
const td = { border: '1px solid #DDD6C4', padding: '5px 8px', fontSize: 10.5 };

function Kop({ pengaturan }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${NAVY_DEEP}`, paddingBottom: 10, marginBottom: 20 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/jm-travel-logo.png" alt="JM Travel" style={{ height: 78, objectFit: 'contain' }} />
      <div style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.5, color: NAVY_DEEP }}>
        <div style={{ fontWeight: 700 }}>{pengaturan.nama_perusahaan}</div>
        <div>{pengaturan.alamat_kantor}</div>
        <div>Phone: {pengaturan.telepon_kantor}</div>
        <div>Email: {pengaturan.email_kantor}</div>
      </div>
    </div>
  );
}

// Section header persis pola di materi asli: judul tebal + garis hitam +
// kotak kecil solid di ujung garis.
function Heading({ children }) {
  return (
    <div style={{ marginBottom: 10, marginTop: 4 }}>
      <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.4, color: '#1A1A1A' }}>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 3 }}>
        <div style={{ flex: 1, height: 2.5, background: '#1A1A1A' }} />
        <div style={{ width: 9, height: 9, background: '#1A1A1A', marginLeft: 4, flexShrink: 0 }} />
      </div>
    </div>
  );
}

function Watermark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo/jm-travel-icon.png" alt="" aria-hidden="true"
      style={{ position: 'absolute', top: '50%', left: '50%', width: 380, transform: 'translate(-50%, -50%)', opacity: 0.05, pointerEvents: 'none' }} />
  );
}

function PrintStyle() {
  return (
    <style>{`
      .jm-list li::marker { color: ${GOLD_DEEP}; font-weight: 700; }
      @media print {
        .no-print { display: none !important; }
        body { background: #fff !important; }
        .sheet { box-shadow: none !important; margin: 0 auto !important; page-break-after: always; width: 100% !important; }
      }
      @page { size: A4; margin: 0; }
    `}</style>
  );
}

function Sheet({ children, style, watermark = true }) {
  return (
    <div className="sheet" style={{ background: '#fff', width: 760, margin: '0 auto 20px', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', minHeight: 940, position: 'relative', overflow: 'hidden', ...style }}>
      {watermark && <Watermark />}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// Halaman yang ditempel APA ADANYA dari hasil export Canva — dipakai kalau
// admin sudah upload gambar_cover/keutamaan/penutup di Company Profile,
// biar gak dibangun ulang di HTML (gak akan pernah identik).
function ImageSheet({ src }) {
  return (
    <div className="sheet" style={{ width: 760, margin: '0 auto 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', lineHeight: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  );
}

function CornerTriangles({ variant = 'light' }) {
  const top = variant === 'dark' ? GOLD : `${GOLD}55`;
  const bottom = variant === 'dark' ? '#ffffff33' : `${NAVY_MID}22`;
  return (
    <>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 130px 130px 0', borderColor: `transparent ${top} transparent transparent` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '110px 110px 0 0', borderColor: `${bottom} transparent transparent transparent` }} />
    </>
  );
}

function OrgBox({ nama, jabatan }) {
  if (!nama) return null;
  return (
    <div style={{ display: 'inline-block', background: GOLD, borderRadius: 10, padding: '9px 16px', margin: '0 6px', minWidth: 140, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <div style={{ fontWeight: 800, fontSize: 10.5, color: '#1A1A1A' }}>{nama}</div>
      <div style={{ fontSize: 9.5, color: '#3a3a3a' }}>{jabatan}</div>
    </div>
  );
}
function Connector() { return <div style={{ width: 2, height: 16, background: '#B8B8B8', margin: '2px auto' }} />; }

function OrgChart({ profile }) {
  const l3 = parseJson(profile.org_l3, []);
  if (!profile.org_ceo_nama) return null;
  return (
    <div style={{ textAlign: 'center', marginTop: 10, marginBottom: 6 }}>
      <OrgBox nama={profile.org_ceo_nama} jabatan={profile.org_ceo_jabatan} />
      {profile.org_l2_nama && (<><Connector /><OrgBox nama={profile.org_l2_nama} jabatan={profile.org_l2_jabatan} /></>)}
      {l3.length > 0 && (
        <>
          <Connector />
          <div style={{ display: 'inline-flex', position: 'relative', paddingTop: 14 }}>
            {l3.length > 1 && <div style={{ position: 'absolute', top: 0, left: 40, right: 40, height: 2, background: '#B8B8B8' }} />}
            {l3.map((b, i) => (
              <div key={i} style={{ position: 'relative', padding: '0 6px' }}>
                <div style={{ width: 2, height: 14, background: '#B8B8B8', margin: '0 auto' }} />
                <OrgBox nama={b.nama} jabatan={b.jabatan} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InfoTable({ rows }) {
  const isi = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (isi.length === 0) return null;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
      <tbody>
        {isi.map(([label, val]) => (
          <tr key={label}>
            <td style={{ ...td, fontWeight: 700, width: '35%', background: CREAM }}>{label}</td>
            <td style={td}>{val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ItineraryTable({ itinerary }) {
  if (!itinerary || itinerary.length === 0 || !itinerary.some(Boolean)) return null;
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: NAVY_DEEP }}>Itinerary</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <tbody>
          {itinerary.map((teks, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 700, width: '15%', whiteSpace: 'nowrap', background: CREAM }}>Hari {i + 1}</td>
              <td style={{ ...td, whiteSpace: 'pre-line' }}>{teks || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Program yang diambil dari katalog `programs` — struktur 3 paket x 3 kamar.
function CatalogProgramCard({ p }) {
  const includeItems = (p.include_items || '').split('\n').map(s => s.trim()).filter(Boolean);
  const itinerary = parseJson(p.itinerary, []);
  return (
    <div style={{ marginBottom: 24, breakInside: 'avoid', border: '1px solid #E3E0D6', borderRadius: 8, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: NAVY_DEEP, marginBottom: 8 }}>{p.name}</div>
      <InfoTable rows={[
        ['Jenis Program', p.jenis_program], ['Total Hari Program', p.durasi ? `${p.durasi} Hari` : ''], ['Tanggal', p.tanggal],
        ['Hotel Mekkah', p.hotel_mekkah_deluxe], ['Hotel Madinah', p.hotel_madinah_deluxe],
      ]} />
      <ItineraryTable itinerary={itinerary} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead><tr><th style={th}>Paket</th>{KAMAR.map(k => <th key={k} style={{ ...th, textAlign: 'center' }}>{KAMAR_LABEL[k]}</th>)}</tr></thead>
        <tbody>
          {PAKET.map((paket, i) => (
            <tr key={paket} style={{ background: i % 2 ? CREAM : '#fff' }}>
              <td style={{ ...td, fontWeight: 700 }}>{PAKET_LABEL[paket]}</td>
              {KAMAR.map(kamar => {
                const harga = Number(p[`harga_${paket}_${kamar}`] || 0);
                return <td key={kamar} style={{ ...td, textAlign: 'right' }}>{harga > 0 ? rp(harga) : '-'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {includeItems.length > 0 && (
        <div style={{ fontSize: 10.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 2, color: NAVY_DEEP }}>Termasuk:</div>
          <ul className="jm-list" style={{ margin: 0, paddingLeft: 16 }}>{includeItems.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// Program custom yang dibikin khusus buat 1 proposal — harga fleksibel
// (per tipe kamar atau 1 harga buat semua kamar), info program lebih detail
// (pax, transportasi, hotel per lokasi) sesuai kebutuhan nyata pitch corporate.
function CustomProgramCard({ p }) {
  return (
    <div style={{ marginBottom: 24, breakInside: 'avoid', border: '1px solid #E3E0D6', borderRadius: 8, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: NAVY_DEEP, marginBottom: 8 }}>{p.nama}</div>
      <InfoTable rows={[
        ['Jenis Program', p.jenis_program], ['Total Hari Program', p.durasi ? `${p.durasi} Hari` : ''],
        ['Pax Jamaah', p.pax_jamaah], ['Pax Tour Leader', p.pax_tl], ['Pax Mutawwif', p.pax_mutawwif],
        ['Transportasi', p.transportasi], ['Haramain Express', p.haramain_express], ['City Tour', p.city_tour],
        ...(p.hotel || []).filter(h => h.lokasi).map(h => [`Hotel — ${h.lokasi}`, `${h.bintang || ''}${h.bintang ? '★' : ''}${h.malam ? `, ${h.malam} malam` : ''}`]),
      ]} />
      <ItineraryTable itinerary={p.itinerary} />
      {p.harga_mode === 'semua_kamar' ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Bintang / Paket</th><th style={{ ...th, textAlign: 'right' }}>Semua Tipe Kamar</th></tr></thead>
          <tbody><tr><td style={td}>Harga Paket (Custom)</td><td style={{ ...td, textAlign: 'right', fontWeight: 700, color: NAVY_DEEP }}>{rp(p.harga_semua)}</td></tr></tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Bintang / Paket</th>{KAMAR.map(k => <th key={k} style={{ ...th, textAlign: 'right' }}>{KAMAR_LABEL[k]}</th>)}</tr></thead>
          <tbody><tr>
            <td style={td}>Harga Paket (Custom)</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: NAVY_DEEP }}>{rp(p.harga_quad)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: NAVY_DEEP }}>{rp(p.harga_triple)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: NAVY_DEEP }}>{rp(p.harga_double)}</td>
          </tr></tbody>
        </table>
      )}
    </div>
  );
}

function Checklist({ items }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: NAVY_DEEP, color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>✓</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{it}</div>
        </div>
      ))}
    </div>
  );
}

export default function CetakProposalPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user.role !== 'super_admin') { setDitolak(true); setLoading(false); return; }
    fetch(`/api/admin/proposal-corporate/${id}`)
      .then(r => r.json())
      .then(d => {
        if (!d.proposal) { setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, id]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Halaman ini khusus super admin.</p>
      <button onClick={() => router.push('/admin')} style={{ marginTop: 16, background: NAVY_MID, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>← Kembali</button>
    </div>
  );

  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Proposal tidak ditemukan.</div>;

  const { proposal, programs, profile, dokumentasi } = data;
  const customPrograms = parseJson(proposal.custom_programs, []);
  const picKami = proposal.pic_kantor_nama || pengaturan.nama_penandatangan || '';
  const jabatanPicKami = proposal.jabatan_pic_kantor || pengaturan.jabatan_penandatangan || '';
  const legalDokumen = parseJson(profile?.legal_dokumen, []);
  const legalInfo = !!(profile?.merk_dagang || profile?.no_registrasi_ghapura || profile?.no_sk_haji || profile?.no_sk_ppiu || profile?.no_sertifikat_ppiu);

  const visiMisi = profile?.visi || profile?.misi;
  const adaOrgChart = !!profile?.org_ceo_nama;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: NAVY_MID, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>{proposal.nomor_proposal} · di dialog print pilih &quot;Save as PDF&quot;</div>
      </div>

      {/* HALAMAN 1 — Surat Pengantar */}
      <Sheet>
        <Kop pengaturan={pengaturan} />
        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, color: NAVY_DEEP }}>PROPOSAL KERJA SAMA</div>
        <div style={{ textAlign: 'center', fontSize: 11.5, marginBottom: 18, color: '#666' }}>Nomor: {proposal.nomor_proposal}</div>

        <div style={{ fontSize: 12, marginBottom: 16 }}>
          Kepada Yth.<br />
          <b>{proposal.nama_pic_perusahaan || 'Bapak/Ibu Pimpinan'}</b><br />
          {proposal.nama_perusahaan}<br />
          {proposal.alamat_perusahaan}
        </div>

        <p style={{ fontSize: 12, lineHeight: 1.6 }}>Assalamualaikum warrohmatulahi wabarokatuh.</p>

        <p style={{ fontSize: 12, lineHeight: 1.6, textAlign: 'justify' }}>
          Bersama ini kami mewakili JM Travel Umroh dan Haji bermaksud untuk mengajukan proposal kerja sama
          {proposal.tujuan ? <> untuk <b>{proposal.tujuan}</b></> : ''}.
        </p>

        {proposal.kata_pengantar && (
          <p style={{ fontSize: 12, lineHeight: 1.6, textAlign: 'justify' }}>{proposal.kata_pengantar}</p>
        )}

        <p style={{ fontSize: 12, lineHeight: 1.6 }}>
          Detail isi proposal terlampirkan pada <i>company profile</i> dan proposal penawaran harga paket perjalanan kami.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6 }}>
          Besar harapan agar kami dapat diberikan waktu untuk bersilaturrahim guna menjelaskan detail dari proposal kerjasama ini.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6 }}>Atas perhatiannya kami ucapkan terima kasih.</p>

        <div style={{ marginTop: 24, fontSize: 12 }}>
          <div>Salam hormat,</div>
          <div style={{ height: 50 }}></div>
          <div style={{ fontWeight: 700, color: NAVY_DEEP }}>{picKami}</div>
          <div>{jabatanPicKami}</div>
          {proposal.pic_kantor_kontak && <div>📱 {proposal.pic_kantor_kontak}</div>}
        </div>
      </Sheet>

      {/* HALAMAN 2 — Cover Company Profile */}
      {profile?.gambar_cover ? <ImageSheet src={profile.gambar_cover} /> : (
      <Sheet watermark={false} style={{ background: `linear-gradient(155deg, ${NAVY_DEEP} 0%, ${NAVY_MID} 100%)`, color: '#fff', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 0 }}>
        {/* Foto asli dari materi Canva — menara jam & kubah hijau di kiri-kanan, Kaka'bah+pesawat di bawah, memudar ke navy biar nyatu sama background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/proposal-assets/cover-clocktower.png" alt="" aria-hidden="true"
          style={{ position: 'absolute', top: 0, left: 0, height: '78%', width: 'auto', maskImage: 'linear-gradient(to right, black 55%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 55%, transparent 100%)', opacity: 0.85 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/proposal-assets/cover-greendome.png" alt="" aria-hidden="true"
          style={{ position: 'absolute', top: 0, right: 0, height: '55%', width: 'auto', maskImage: 'linear-gradient(to left, black 55%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to left, black 55%, transparent 100%)', opacity: 0.85 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/proposal-assets/cover-kaaba-plane.png" alt="" aria-hidden="true"
          style={{ position: 'absolute', bottom: 0, right: 0, width: '78%', height: 'auto', maskImage: 'linear-gradient(to top, black 40%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to top, black 40%, transparent 95%)', opacity: 0.9 }} />

        <div style={{ position: 'relative', padding: '80px 40px' }}>
          <div style={{ display: 'inline-block', background: '#fff', borderRadius: 18, padding: '16px 32px', marginBottom: 26 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/jm-travel-logo.png" alt="JM Travel" style={{ height: 74 }} />
          </div>
          {profile?.tagline && <div style={{ fontSize: 19, fontWeight: 800, color: GOLD, marginBottom: 16, padding: '0 30px' }}>&quot;{profile.tagline}&quot;</div>}
          {profile?.deskripsi_singkat && <p style={{ fontSize: 12.5, lineHeight: 1.7, maxWidth: 480, margin: '0 auto 26px', opacity: 0.92 }}>{profile.deskripsi_singkat}</p>}
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '16px 26px', fontSize: 11, textAlign: 'left', lineHeight: 1.9 }}>
            <div><b style={{ color: GOLD }}>Alamat</b> : {pengaturan.alamat_kantor}</div>
            <div><b style={{ color: GOLD }}>Telepon</b> : {pengaturan.telepon_kantor}</div>
            <div><b style={{ color: GOLD }}>Email</b> : {pengaturan.email_kantor}</div>
            {pengaturan.wa_kantor && <div><b style={{ color: GOLD }}>WhatsApp</b> : {pengaturan.wa_kantor}</div>}
          </div>
        </div>
      </Sheet>
      )}

      {/* HALAMAN 3 — Profile, Visi Misi, Org Chart */}
      {(profile?.profil || visiMisi || adaOrgChart) && (
        <Sheet>
          {profile?.profil && (<>
            <Heading>PROFILE</Heading>
            <p style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 18 }}>{profile.profil}</p>
          </>)}
          {visiMisi && (<>
            <Heading>VISI MISI</Heading>
            {profile?.visi && (<><div style={{ fontWeight: 700, fontSize: 12, color: NAVY_DEEP }}>VISI</div><p style={{ fontSize: 12, marginBottom: 8 }}>{profile.visi}</p></>)}
            {profile?.misi && (<>
              <div style={{ fontWeight: 700, fontSize: 12, color: NAVY_DEEP }}>MISI</div>
              <ul className="jm-list" style={{ fontSize: 12, marginTop: 4, marginBottom: 18 }}>{bullets(profile.misi).map((b, i) => <li key={i}>{b}</li>)}</ul>
            </>)}
          </>)}
          {adaOrgChart && (<>
            <Heading>BOD TEAM</Heading>
            <OrgChart profile={profile} />
          </>)}
        </Sheet>
      )}

      {/* HALAMAN 4 — Keutamaan, Paket Umroh, Perlengkapan Jamaah */}
      {profile?.gambar_keutamaan ? <ImageSheet src={profile.gambar_keutamaan} /> : (
        (profile?.keutamaan || profile?.paket_umroh || profile?.perlengkapan_jamaah) && (
          <Sheet>
            <CornerTriangles variant="light" />
            {profile?.keutamaan && (<>
              <Heading>KEUTAMAAN JM TRAVEL</Heading>
              <ol className="jm-list" style={{ fontSize: 12, marginBottom: 18 }}>{bullets(profile.keutamaan).map((b, i) => <li key={i}>{b}</li>)}</ol>
            </>)}
            {profile?.paket_umroh && (<>
              <Heading>PAKET UMROH</Heading>
              <ul className="jm-list" style={{ fontSize: 12, marginBottom: 18 }}>{bullets(profile.paket_umroh).map((b, i) => <li key={i}>{b}</li>)}</ul>
            </>)}
            {profile?.perlengkapan_jamaah && (<>
              <Heading>PERLENGKAPAN JAMAAH</Heading>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <ol className="jm-list" style={{ fontSize: 12, flex: 1 }}>{bullets(profile.perlengkapan_jamaah).map((b, i) => <li key={i}>{b}</li>)}</ol>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile?.perlengkapan_foto || '/images/proposal-assets/perlengkapan-produk.png'} alt="Perlengkapan Jamaah" style={{ width: 210, objectFit: 'contain' }} />
              </div>
            </>)}
          </Sheet>
        )
      )}

      {/* HALAMAN — Syarat & Ketentuan */}
      {(profile?.syarat_persyaratan_umroh || profile?.syarat_pembatalan_umroh || profile?.syarat_haji_khusus || profile?.layanan_umroh_mandiri || profile?.wisata_non_umroh || profile?.dinas_dalam_negeri) && (
        <Sheet>
          {profile?.syarat_persyaratan_umroh && (<>
            <Heading>PERSYARATAN UMROH</Heading>
            <ul className="jm-list" style={{ fontSize: 12, marginBottom: 16 }}>{bullets(profile.syarat_persyaratan_umroh).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </>)}
          {profile?.syarat_pembatalan_umroh && (<>
            <Heading>PEMBATALAN UMROH</Heading>
            <ul className="jm-list" style={{ fontSize: 12, marginBottom: 16 }}>{bullets(profile.syarat_pembatalan_umroh).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </>)}
          {profile?.syarat_haji_khusus && (<>
            <Heading>HAJI KHUSUS</Heading>
            <p style={{ fontSize: 12, whiteSpace: 'pre-line', marginBottom: 16 }}>{profile.syarat_haji_khusus}</p>
          </>)}
          {profile?.layanan_umroh_mandiri && (<>
            <Heading>LAYANAN UMROH MANDIRI</Heading>
            <ul className="jm-list" style={{ fontSize: 12, marginBottom: 16 }}>{bullets(profile.layanan_umroh_mandiri).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </>)}
          {profile?.wisata_non_umroh && (<>
            <Heading>PERJALANAN WISATA NON UMROH</Heading>
            <p style={{ fontSize: 12, marginBottom: 16 }}>{profile.wisata_non_umroh}</p>
          </>)}
          {profile?.dinas_dalam_negeri && (<>
            <Heading>PERJALANAN DINAS DALAM NEGERI</Heading>
            <p style={{ fontSize: 12 }}>{profile.dinas_dalam_negeri}</p>
          </>)}
        </Sheet>
      )}

      {/* HALAMAN — Program yang Ditawarkan */}
      {(programs.length > 0 || customPrograms.length > 0) && (
        <Sheet>
          <Heading>PROGRAM YANG DITAWARKAN</Heading>
          {programs.map(p => <CatalogProgramCard key={p.id} p={p} />)}
          {customPrograms.map((p, i) => <CustomProgramCard key={i} p={p} />)}
        </Sheet>
      )}

      {/* HALAMAN — Legalitas (info perusahaan + scan dokumen) */}
      {(legalInfo || legalDokumen.length > 0) && (
        <Sheet>
          <Heading>LEGALITAS</Heading>
          {legalInfo && (
            <InfoTable rows={[
              ['Nama Perusahaan', pengaturan.nama_perusahaan],
              ['Merk Dagang', profile?.merk_dagang],
              ['No. Registrasi Ghapura', profile?.no_registrasi_ghapura],
              ['No. SK Haji (PIHK)', profile?.no_sk_haji],
              ['No. SK PPIU', profile?.no_sk_ppiu],
              ['No. Sertifikat PPIU', profile?.no_sertifikat_ppiu],
            ]} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {legalDokumen.map((d, i) => (
              <div key={i} style={{ border: '1px solid #E3E0D6', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                {d.tipe === 'application/pdf' ? (
                  <div style={{ padding: '30px 0', fontSize: 11 }}>📄 Lampiran PDF terpisah</div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={d.path} alt={d.label} style={{ width: '100%', objectFit: 'contain', maxHeight: 260 }} />
                )}
                <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 4, color: NAVY_DEEP }}>{d.label}</div>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {/* HALAMAN — Dokumentasi */}
      {dokumentasi?.length > 0 && (
        <Sheet>
          <Heading>DOKUMENTASI</Heading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {dokumentasi.map((d, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={d.foto_path} alt="Dokumentasi" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid #E3E0D6' }} />
            ))}
          </div>
        </Sheet>
      )}

      {/* HALAMAN TERAKHIR — Penutup */}
      {profile?.gambar_penutup ? <ImageSheet src={profile.gambar_penutup} /> : (
      <Sheet watermark={false} style={{ background: `linear-gradient(155deg, ${NAVY_DEEP} 0%, ${NAVY_MID} 100%)`, color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/proposal-assets/poster-landmarks.png" alt="" style={{ width: '90%', maxWidth: 480, margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginBottom: 0, letterSpacing: 0.5 }}>UMROH AMAN &amp; NYAMAN</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 4 }}>BERSAMA JM TRAVEL</div>
          <div style={{ fontSize: 12, fontStyle: 'italic', color: GOLD, marginBottom: 22 }}>Wujudkan perjalanan ibadah impian Anda</div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', textAlign: 'left' }}>
            {profile?.keutamaan && (
              <div style={{ background: GOLD, borderRadius: 14, padding: 20, color: '#1A1A1A', flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 10 }}>KEUNGGULAN KAMI</div>
                <Checklist items={bullets(profile.keutamaan)} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/proposal-assets/poster-cablecar.png" alt="" style={{ width: 130, height: 130, borderRadius: '50%', objectFit: 'cover', border: `4px solid ${GOLD}` }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/proposal-assets/poster-hotel.png" alt="" style={{ width: 130, height: 130, borderRadius: '50%', objectFit: 'cover', border: `4px solid ${NAVY_MID}`, outline: '2px solid #fff' }} />
            </div>
          </div>

          <div style={{ fontSize: 12, textAlign: 'center', marginTop: 22 }}>
            {pengaturan.alamat_kantor}<br />
            {pengaturan.wa_kantor && <>WhatsApp: {pengaturan.wa_kantor}<br /></>}
            {pengaturan.bank_nama && (
              <div style={{ marginTop: 12, fontWeight: 700, background: 'rgba(255,255,255,0.12)', display: 'inline-block', padding: '8px 16px', borderRadius: 8 }}>
                Rekening tujuan transfer: {pengaturan.bank_nama} {pengaturan.bank_rekening} a.n. {pengaturan.bank_atas_nama}
              </div>
            )}
          </div>

          <div style={{ marginTop: 28, fontSize: 12, textAlign: 'right' }}>
            <div style={{ display: 'inline-block', textAlign: 'center' }}>
              <div>Hormat kami,</div>
              <div style={{ fontWeight: 700, color: GOLD }}>JM Travel</div>
              <div style={{ height: 50 }}></div>
              <div style={{ borderTop: '1px solid #fff', paddingTop: 4 }}>({picKami})</div>
            </div>
          </div>
        </div>
      </Sheet>
      )}

      <PrintStyle />
    </div>
  );
}
