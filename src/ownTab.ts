// Tab baru yang dibuka aplikasi sendiri (cetak, laporan, lacak, lampiran). Saat tab itu tampil, halaman
// ini ikut tersembunyi; antrean WA tidak perlu langsung dikirim karenanya (lihat notifyQueue.ts).
let openedAt = 0;

/** Tandai bahwa aplikasi baru saja membuka tab sendiri, mis. dari onClick tautan target="_blank". */
export const markOwnTab = () => {
  openedAt = Date.now();
};

/** window.open('', '_blank') yang ditandai sebagai tab milik aplikasi. */
export function openOwnTab(url = '') {
  markOwnTab();
  return window.open(url, '_blank');
}

/** Halaman tersembunyi karena tab milik aplikasi baru saja dibuka (±1,5 detik terakhir). */
export const ownTabJustOpened = (ms = 1500) => Date.now() - openedAt < ms;
