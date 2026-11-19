const { PDFDocument } = PDFLib;

// ================= KONFIGURASI & REGEX =================
const KATA_KUNCI_SIRKULER = "sirkuler";
const URUTAN = ["INVOICE", "REPORT", "EMAIL"];
const NAMA_FOLDER_HASIL = "HASIL_COMPILE";
const NAMA_FOLDER_INPUT_JV = "JV";
const NAMA_FOLDER_COMBINE = "COMBINE";

const MAP_JENIS = {
  INVOICE: "INVOICE", INV: "INVOICE", INVOCE: "INVOICE", INVO: "INVOICE", INVOICEE: "INVOICE",
  REPORT: "REPORT", LAP: "REPORT", LAPORAN: "REPORT", REPORTT: "REPORT", REP: "REPORT",
  EMAIL: "EMAIL", MAIL: "EMAIL", EMAILL: "EMAIL"
};

// State penyimpanan file & hasil PDF
let raFiles = [];
let raResultFiles = [];
let raTargetFolderName = NAMA_FOLDER_HASIL;

let fgFiles = [];
let fgResultFiles = [];
let fgTargetFolderName = NAMA_FOLDER_COMBINE;

// ================= NAVIGASI VIEW =================
function showFrame(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
}

// ================= EVENT PILIH FOLDER =================
document.getElementById("raFolderInput").addEventListener("change", (e) => {
  raFiles = Array.from(e.target.files);
  if (raFiles.length > 0) {
    const rootName = raFiles[0].webkitRelativePath.split("/")[0];
    document.getElementById("raFolderDisplay").value = `${rootName} (${raFiles.length} file ditemukan)`;
  }
});

document.getElementById("fgFolderInput").addEventListener("change", (e) => {
  fgFiles = Array.from(e.target.files);
  if (fgFiles.length > 0) {
    const rootName = fgFiles[0].webkitRelativePath.split("/")[0];
    document.getElementById("fgFolderDisplay").value = `${rootName} (${fgFiles.length} file ditemukan)`;
  }
});

// ================= HELPER UI & LOG =================
function tulisLog(prefix, teks, level = "info") {
  const box = document.getElementById(`${prefix}LogBox`);
  const line = document.createElement("div");
  line.className = `log-${level}`;
  line.textContent = teks;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function bersihkanLog(prefix) {
  document.getElementById(`${prefix}LogBox`).innerHTML = "";
  document.getElementById(`${prefix}LblOk`).textContent = "–";
  document.getElementById(`${prefix}LblSkip`).textContent = "–";
  document.getElementById(`${prefix}Status`).textContent = "Siap.";
}

function setSibuk(prefix, sibuk) {
  const bar = document.getElementById(`${prefix}ProgressBar`);
  if (sibuk) {
    bar.classList.add("indeterminate");
  } else {
    bar.classList.remove("indeterminate");
    bar.style.width = "0%";
  }

  if (prefix === "ra") {
    document.getElementById("raBtnProses").disabled = sibuk;
    document.getElementById("raBtnJv").disabled = sibuk;
    document.getElementById("raBtnBersih").disabled = sibuk;
    document.getElementById("raBtnBuka").disabled = sibuk || raResultFiles.length === 0;
  } else {
    document.getElementById("fgBtnProses").disabled = sibuk;
    document.getElementById("fgBtnBersih").disabled = sibuk;
    document.getElementById("fgBtnBuka").disabled = sibuk || fgResultFiles.length === 0;
  }
}

// ================= HELPER SIMPAN LANGSUNG KE FOLDER =================
async function pilihFolderTujuan(namaSubfolder) {
  if (!window.showDirectoryPicker) {
    return null; // Fallback untuk browser selain Chrome/Edge
  }
  const rootHandle = await window.showDirectoryPicker({
    mode: "readwrite",
    startIn: "downloads"
  });
  return await rootHandle.getDirectoryHandle(namaSubfolder, { create: true });
}

async function simpanSatuFileKeFolder(dirHandle, filename, bytes) {
  if (dirHandle) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
  } else {
    // Fallback download langsung per PDF jika browser tidak mendukung showDirectoryPicker
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

async function unduhHasilRA() {
  if (raResultFiles.length === 0) return;
  try {
    const dirHandle = await pilihFolderTujuan(raTargetFolderName);
    for (const item of raResultFiles) {
      await simpanSatuFileKeFolder(dirHandle, item.name, item.bytes);
    }
    document.getElementById("raStatus").textContent = `Berhasil menyimpan ${raResultFiles.length} file ke folder '${raTargetFolderName}'.`;
  } catch (err) {
    if (err.name !== "AbortError") alert("Gagal menyimpan: " + err.message);
  }
}

async function unduhHasilFighter() {
  if (fgResultFiles.length === 0) return;
  try {
    const dirHandle = await pilihFolderTujuan(fgTargetFolderName);
    for (const item of fgResultFiles) {
      await simpanSatuFileKeFolder(dirHandle, item.name, item.bytes);
    }
    document.getElementById("fgStatus").textContent = `Berhasil menyimpan ${fgResultFiles.length} file ke folder '${fgTargetFolderName}'.`;
  } catch (err) {
    if (err.name !== "AbortError") alert("Gagal menyimpan: " + err.message);
  }
}

// ================= HELPER STRING & PDF MERGE =================
function bersihkanNama(teks) {
  return teks.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}

function norm(teks) {
  return teks
    .replace(/\b(PT|CV)\.?\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function beda(items, kunci) {
  const grup = {};
  for (const it of items) {
    const k = norm(it[kunci]);
    if (!grup[k]) grup[k] = { asli: it[kunci], jenis: [] };
    grup[k].jenis.push(it.jenis);
  }
  const vals = Object.values(grup);
  if (vals.length <= 1) return null;
  return vals
    .map(g => {
      const uniqueJenis = [...new Set(g.jenis)].sort((a, b) => URUTAN.indexOf(a) - URUTAN.indexOf(b));
      return `${g.asli} (${uniqueJenis.join(", ")})`;
    })
    .join(" vs ");
}

async function mergePdfFiles(fileObjects) {
  const mergedPdf = await PDFDocument.create();
  for (const fileObj of fileObjects) {
    const arrayBuffer = await fileObj.arrayBuffer();
    const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  const pdfBytes = await mergedPdf.save();
  return { bytes: pdfBytes, pageCount: mergedPdf.getPageCount() };
}

// =========================================================================
// PARSER FLEKSIBEL INSENTIF RA (STRUKTUR FOLDER IRE & NAMA FILE BEBAS POSISI)
// =========================================================================
function parseFileRA(fileObj) {
  const parts = fileObj.webkitRelativePath.split("/");
  const rawNameNoExt = fileObj.name.replace(/\.pdf$/i, "").trim();

  const regexJenisFolder = /\b(INVOICE|INV|INVOCE|INVO|INVOICEE|REPORT|REP|REPORTT|LAP|LAPORAN|EMAIL|MAIL|EMAILL|KONFIRMASI)\b/i;
  const regexJenisFile = /(?:^|[\s_\-\.])(?<jenis>INVOICE|INV|INVOCE|INVO|INVOICEE|REPORT|REP|REPORTT|LAP|LAPORAN|EMAIL|MAIL|EMAILL)(?=$|[\s_\-\.])/i;

  let jenisStandar = null;
  let teksKerja = rawNameNoExt;

  for (let i = parts.length - 2; i >= 1; i--) {
    const matchFolder = parts[i].match(regexJenisFolder);
    if (matchFolder) {
      const jenisRaw = matchFolder[1].toUpperCase();
      jenisStandar = jenisRaw === "KONFIRMASI" ? "EMAIL" : (MAP_JENIS[jenisRaw] || jenisRaw);
      break;
    }
  }

  if (!jenisStandar) {
    const matchFile = teksKerja.match(regexJenisFile);
    if (matchFile) {
      const jenisRaw = matchFile.groups.jenis.toUpperCase();
      jenisStandar = MAP_JENIS[jenisRaw] || jenisRaw;
    }
  }

  if (!jenisStandar) return null;

  teksKerja = teksKerja
    .replace(/(?:^|[\s_\-\.])(INVOICE|INV|INVOCE|INVO|INVOICEE|REPORT|REP|REPORTT|LAP|LAPORAN|EMAIL|MAIL|EMAILL|KONFIRMASI|PIC\s+RUNNER|IRES|IRE)(?=$|[\s_\-\.])/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let kodeRaw = "";
  const matchKode = teksKerja.match(/^(?<kode>\d{4,8})\s*(?:[-–_.]\s*)?(?<rest>.+)$/);
  if (matchKode) {
    kodeRaw = matchKode.groups.kode;
    teksKerja = matchKode.groups.rest.trim();
  }

  teksKerja = teksKerja.replace(/^[-–_.\s]+|[-–_.\s]+$/g, "").trim();

  let namaRaw = teksKerja;
  let sisaRaw = "";

  const matchSisa = teksKerja.match(
    /^(?<nama>.+?)\s+(?<sisa>(?:(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|ags|sep|sept|okt|nov|des)\b.*|\([\d.,]+\).*))$/i
  );
  if (matchSisa) {
    namaRaw = matchSisa.groups.nama.trim();
    sisaRaw = matchSisa.groups.sisa.trim();
  }

  namaRaw = namaRaw.replace(/[-–_.\s]+$/g, "").trim();
  if (!namaRaw) return null;

  return {
    kode: kodeRaw,
    jenis: jenisStandar,
    nama: namaRaw,
    sisa: sisaRaw,
    file: fileObj
  };
}

// =========================================================================
// BAGIAN 1A: INSENTIF RA - MERGED PDF
// =========================================================================
async function mulaiProsesRA() {
  if (!raFiles.length) {
    alert("Silakan pilih folder terlebih dahulu.");
    return;
  }

  const semuaPdf = raFiles.filter(f => {
    const parts = f.webkitRelativePath.split("/");
    const folderAbaikan = parts.some(part =>
      [NAMA_FOLDER_HASIL, NAMA_FOLDER_COMBINE].includes(part.toUpperCase())
    );
    return f.name.toLowerCase().endsWith(".pdf") && !folderAbaikan;
  });

  if (semuaPdf.length === 0) {
    alert("Error: Tidak ada file PDF di folder ini.");
    return;
  }

  const sirkuler = semuaPdf.filter(f =>
    f.name.toLowerCase().includes(KATA_KUNCI_SIRKULER) ||
    f.webkitRelativePath.toLowerCase().split("/").slice(1, -1).some(dir => dir.includes(KATA_KUNCI_SIRKULER))
  );
  if (sirkuler.length === 0) {
    alert("Error: File Sirkuler tidak ditemukan.\nPastikan nama file atau folder mengandung kata 'Sirkuler'.");
    return;
  }

  // Pop-up pilih folder tujuan simpan (otomatis membuat subfolder HASIL_COMPILE)
  let dirHandle = null;
  try {
    dirHandle = await pilihFolderTujuan(NAMA_FOLDER_HASIL);
  } catch (err) {
    if (err.name === "AbortError") return; // User menekan Cancel pada pop-up
    alert("Gagal membuka folder tujuan: " + err.message);
    return;
  }

  bersihkanLog("ra");
  raResultFiles = [];
  raTargetFolderName = NAMA_FOLDER_HASIL;
  setSibuk("ra", true);

  try {
    const fileSirkuler = sirkuler[0];
    tulisLog("ra", `Sirkuler : ${fileSirkuler.name}\n`, "head");

    const parsedItems = [];
    for (const p of semuaPdf) {
      if (p === fileSirkuler) continue;
      const item = parseFileRA(p);
      if (item) parsedItems.push(item);
    }

    const mapNamaKeKode = {};
    for (const it of parsedItems) {
      if (it.kode) {
        mapNamaKeKode[norm(it.nama)] = it.kode;
      }
    }

    const data = {};
    for (const it of parsedItems) {
      const kodeEfektif = it.kode || mapNamaKeKode[norm(it.nama)] || "";
      const kunciGrup = kodeEfektif ? kodeEfektif : norm(it.nama);
      if (!data[kunciGrup]) data[kunciGrup] = [];
      data[kunciGrup].push(it);
    }

    let berhasil = 0;
    const dilewati = [];

    for (const kode of Object.keys(data).sort()) {
      const items = data[kode];
      const files = {};
      for (const it of items) {
        if (!files[it.jenis]) files[it.jenis] = [];
        files[it.jenis].push(it.file);
      }

      let alasan = null;
      const kd = items.find(i => i.kode)?.kode || "";
      const nm = items[0].nama;
      let label = kd ? `${kd} - ${nm}` : nm;

      const txtNama = beda(items, "nama");
      if (txtNama) {
        alasan = `nama dealer tidak sama: ${txtNama}`;
        label = kode;
      }

      if (!alasan) {
        const kurang = URUTAN.filter(j => !files[j]);
        const dobel = URUTAN.filter(j => (files[j] || []).length > 1);
        if (kurang.length > 0) {
          alasan = `dokumen belum ada: ${kurang.join(", ")}`;
        } else if (dobel.length > 0) {
          alasan = `file dobel: ${dobel.join(", ")}`;
        }
      }

      if (alasan) {
        dilewati.push(`${label}: ${alasan}`);
        tulisLog("ra", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
        continue;
      }

      try {
        document.getElementById("raStatus").textContent = `Menggabungkan: ${label}...`;
        const daftarFile = [...URUTAN.map(j => files[j][0]), fileSirkuler];
        const { bytes, pageCount } = await mergePdfFiles(daftarFile);

        const ref = items.find(i => i.jenis === "INVOICE");
        const kdOut = ref.kode || kd;
        const prefix = kdOut ? `${kdOut} - ` : "";
        const sisaTeks = ref.sisa ? ` ${ref.sisa}` : "";
        const namaOutput = bersihkanNama(`${prefix}${ref.nama} COMPILE${sisaTeks}`) + ".pdf";

        await simpanSatuFileKeFolder(dirHandle, namaOutput, bytes);
        raResultFiles.push({ name: namaOutput, bytes });

        berhasil++;
        tulisLog("ra", `[OK]       ${namaOutput}  (${pageCount} halaman)`, "ok");
      } catch (err) {
        dilewati.push(`${label}: gagal diproses (${err.message})`);
        tulisLog("ra", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
      }
    }

    document.getElementById("raLblOk").textContent = String(berhasil);
    document.getElementById("raLblSkip").textContent = String(dilewati.length);
    document.getElementById("raStatus").textContent = `Selesai: ${berhasil} Berhasil disimpan ke folder '${NAMA_FOLDER_HASIL}', ${dilewati.length} dilewati.`;
  } catch (err) {
    alert("Error: " + err.message);
    document.getElementById("raStatus").textContent = "Terjadi kesalahan.";
  } finally {
    setSibuk("ra", false);
  }
}

// =========================================================================
// BAGIAN 1B: INSENTIF RA - GABUNG JV
// =========================================================================
function ekstrakInfoPdf(fileObj) {
  const namaAsli = fileObj.name;
  const mKode = namaAsli.match(/\b(100\d{3}|\d{5,6})\b/);
  const kode = mKode ? mKode[1] : "";

  let teks = namaAsli.replace(/\.pdf$/i, "");
  teks = teks.replace(/^\d{8,12}\s*/, "");
  teks = teks.replace(/_\d{5,6}\b/, "");
  teks = teks.replace(/\b\d{5,6}\s*-\s*/, "");

  const bising = [
    "compile", "september", "oktober", "november", "desember",
    "januari", "februari", "maret", "april", "mei", "juni",
    "juli", "agustus", "2026", "2025", "ok", "ires", "sept"
  ];
  for (const b of bising) {
    teks = teks.replace(new RegExp(`\\b${b}\\b`, "gi"), "");
  }
  teks = teks.replace(/\b20\d{2}\b/g, "");
  teks = teks.replace(/\(\d[\d.,]*\)/g, "");
  teks = teks.replace(/[^\w\s]/g, " ");
  const namaBersih = teks.replace(/\s+/g, " ").trim().toUpperCase();
  return { file: fileObj, namaAsli, kode, namaBersih };
}

function cariPasanganIres(infoJv, daftarIres) {
  if (infoJv.kode) {
    for (const ires of daftarIres) {
      if (ires.kode === infoJv.kode) return ires;
    }
  }
  const jvNama = infoJv.namaBersih.toLowerCase();
  if (jvNama) {
    for (const ires of daftarIres) {
      const iresNama = ires.namaBersih.toLowerCase();
      if (iresNama && (jvNama.includes(iresNama) || iresNama.includes(jvNama))) {
        return ires;
      }
    }
  }
  return null;
}

async function mulaiGabungJV() {
  if (!raFiles.length) {
    alert("Silakan pilih folder terlebih dahulu.");
    return;
  }

  const pdfJvs = raFiles.filter(f => {
    const parts = f.webkitRelativePath.split("/");
    return f.name.toLowerCase().endsWith(".pdf") && parts.length === 3 && parts[1].toUpperCase() === NAMA_FOLDER_INPUT_JV;
  });

  if (pdfJvs.length === 0) {
    alert(`Error: Subfolder '${NAMA_FOLDER_INPUT_JV}' tidak ditemukan atau kosong.`);
    return;
  }

  // Pop-up pilih folder tujuan simpan (otomatis membuat subfolder COMBINE)
  let dirHandle = null;
  try {
    dirHandle = await pilihFolderTujuan(NAMA_FOLDER_COMBINE);
  } catch (err) {
    if (err.name === "AbortError") return;
    alert("Gagal membuka folder tujuan: " + err.message);
    return;
  }

  bersihkanLog("ra");
  raResultFiles = [];
  raTargetFolderName = NAMA_FOLDER_COMBINE;
  setSibuk("ra", true);

  try {
    const pdfCompiles = raFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 2;
    });

    const fileJvs = pdfJvs.map(ekstrakInfoPdf);
    const daftarIres = pdfCompiles.map(ekstrakInfoPdf);

    let berhasil = 0;
    const dilewati = [];

    for (const infoJv of fileJvs) {
      const pasangan = cariPasanganIres(infoJv, daftarIres);
      if (!pasangan) {
        dilewati.push(`${infoJv.namaAsli}: Dokumen IRES tidak ditemukan.`);
        tulisLog("ra", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
        continue;
      }

      try {
        document.getElementById("raStatus").textContent = `Menggabungkan JV: ${infoJv.namaAsli}...`;
        const { bytes, pageCount } = await mergePdfFiles([infoJv.file, pasangan.file]);
        const namaOutput = bersihkanNama(infoJv.namaAsli.slice(0, -4) + " COMPILE") + ".pdf";

        await simpanSatuFileKeFolder(dirHandle, namaOutput, bytes);
        raResultFiles.push({ name: namaOutput, bytes });

        berhasil++;
        tulisLog("ra", `[OK]       ${namaOutput} (${pageCount} hal)`, "ok");
      } catch (err) {
        dilewati.push(`${infoJv.namaAsli}: ${err.message}`);
        tulisLog("ra", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
      }
    }

    document.getElementById("raLblOk").textContent = String(berhasil);
    document.getElementById("raLblSkip").textContent = String(dilewati.length);
    document.getElementById("raStatus").textContent = `Selesai JV: ${berhasil} Berhasil disimpan ke folder '${NAMA_FOLDER_COMBINE}'.`;
  } catch (err) {
    alert("Error: " + err.message);
    document.getElementById("raStatus").textContent = "Terjadi kesalahan.";
  } finally {
    setSibuk("ra", false);
  }
}

// =========================================================================
// BAGIAN 2: FIGHTER DSF & TRADE IN (7 DOKUMEN + JV)
// =========================================================================
function klasifikasiFighter(namaFile) {
  const n = namaFile.toLowerCase();
  if (/(sirkuler)/.test(n)) return 7;
  if (/\b(faktur\s*pajak|fp)\b/.test(n)) return 2;
  if (/(doc\s*conf\s*signed|conf\s*signed)/.test(n)) return 3;
  if (/(report|dokumentasi|pemasangan|lap\s*pemasangan|laporan)/.test(n)) return 4;
  if (/\b(invoice|inv|kwitansi|kuitansi)\b/.test(n)) return 1;
  if (/\b(work\s*order|wo)\b/.test(n)) return 5;
  if (/\b(email|mail)\b/.test(n)) return 6;
  return 0;
}

function cariJvDanT7Fighter(namaDealer, namaUnit, listJv, listT7) {
  const kataKunci = new Set((namaDealer.toLowerCase().match(/\w+/g) || []));
  if (namaUnit) {
    (namaUnit.toLowerCase().match(/\w+/g) || []).forEach(w => kataKunci.add(w));
  }

  function cariTerbaik(koleksiFile) {
    let skorTertinggi = 0;
    let pilihan = null;
    for (const f of koleksiFile) {
      const tokensFile = new Set((f.name.toLowerCase().match(/\w+/g) || []));
      let irisan = 0;
      kataKunci.forEach(k => { if (tokensFile.has(k)) irisan++; });
      if (irisan > 0 && kataKunci.size > 0) {
        const rasio = irisan / kataKunci.size;
        if (rasio > skorTertinggi) {
          skorTertinggi = rasio;
          pilihan = f;
        }
      }
    }
    return pilihan;
  }

  return [cariTerbaik(listJv), cariTerbaik(listT7)];
}

async function mulaiProsesFighter() {
  if (!fgFiles.length) {
    alert("Silakan pilih folder pembayaran terlebih dahulu.");
    return;
  }

  // Pop-up pilih folder tujuan simpan (otomatis membuat subfolder COMBINE)
  let dirHandle = null;
  try {
    dirHandle = await pilihFolderTujuan(NAMA_FOLDER_COMBINE);
  } catch (err) {
    if (err.name === "AbortError") return;
    alert("Gagal membuka folder tujuan: " + err.message);
    return;
  }

  bersihkanLog("fg");
  fgResultFiles = [];
  fgTargetFolderName = NAMA_FOLDER_COMBINE;
  setSibuk("fg", true);

  try {
    const folderAbaikan = new Set(["JV", "COMBINE", "HASIL_COMPILE"]);

    const jvs = fgFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 3 && parts[1].toUpperCase() === NAMA_FOLDER_INPUT_JV;
    });

    const t7Files = fgFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 2 && klasifikasiFighter(f.name) === 7;
    });

    const dealerMap = {};
    for (const f of fgFiles) {
      if (!f.name.toLowerCase().endsWith(".pdf")) continue;
      const parts = f.webkitRelativePath.split("/");
      if (parts.length < 3) continue;

      const dealerName = parts[1];
      if (folderAbaikan.has(dealerName.toUpperCase())) continue;

      if (!dealerMap[dealerName]) {
        dealerMap[dealerName] = { rootFiles: [], units: {} };
      }

      if (parts.length === 3) {
        dealerMap[dealerName].rootFiles.push(f);
      } else if (parts.length >= 4) {
        const unitName = parts[2];
        if (folderAbaikan.has(unitName.toUpperCase())) continue;
        if (!dealerMap[dealerName].units[unitName]) {
          dealerMap[dealerName].units[unitName] = [];
        }
        dealerMap[dealerName].units[unitName].push(f);
      }
    }

    const targetProses = [];
    for (const dlrName of Object.keys(dealerMap).sort()) {
      const info = dealerMap[dlrName];
      const unitNames = Object.keys(info.units).sort();
      if (unitNames.length > 0) {
        for (const uName of unitNames) {
          targetProses.push({ dlrName, unitName: uName, files: info.units[uName] });
        }
      } else {
        targetProses.push({ dlrName, unitName: null, files: info.rootFiles });
      }
    }

    tulisLog("fg", "Memulai proses Fighter DSF & Trade In...\n", "head");

    let berhasil = 0;
    const dilewati = [];

    for (const target of targetProses) {
      const { dlrName, unitName, files } = target;
      const labelNama = unitName ? `${dlrName} - ${unitName}` : dlrName;
      document.getElementById("fgStatus").textContent = `Memproses: ${labelNama}`;

      const filesDitemukan = {};
      for (const p of files) {
        const tipe = klasifikasiFighter(p.name);
        if (tipe >= 1 && tipe <= 6) {
          filesDitemukan[tipe] = p;
        }
      }

      if (Object.keys(filesDitemukan).length === 0) continue;

      const [fileJvMatch, fileT7Match] = cariJvDanT7Fighter(dlrName, unitName, jvs, t7Files);
      if (fileJvMatch) filesDitemukan[0] = fileJvMatch;
      if (fileT7Match) filesDitemukan[7] = fileT7Match;
      else if (t7Files.length === 1) filesDitemukan[7] = t7Files[0];

      const missing = [];
      if (!filesDitemukan[0]) missing.push("JV");
      for (let i = 1; i <= 7; i++) {
        if (!filesDitemukan[i]) missing.push(String(i));
      }
      const peringatan = missing.length > 0 ? ` (Tanpa: ${missing.join(",")})` : "";

      try {
        const daftarUrut = [];
        for (let i = 0; i <= 7; i++) {
          if (filesDitemukan[i]) daftarUrut.push(filesDitemukan[i]);
        }

        const { bytes, pageCount } = await mergePdfFiles(daftarUrut);
        const namaOutput = bersihkanNama(unitName ? `${dlrName}_${unitName}` : dlrName) + " COMPILE.pdf";

        await simpanSatuFileKeFolder(dirHandle, namaOutput, bytes);
        fgResultFiles.push({ name: namaOutput, bytes });

        berhasil++;
        if (peringatan) {
          tulisLog("fg", `[OK]       ${namaOutput} (${pageCount} hal)${peringatan}`, "warn");
        } else {
          tulisLog("fg", `[OK]       ${namaOutput} (${pageCount} hal) [Lengkap]`, "ok");
        }
      } catch (err) {
        dilewati.push(`${labelNama}: Gagal diproses (${err.message})`);
        tulisLog("fg", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
      }
    }

    tulisLog("fg", "\n" + "=".repeat(60), "info");
    tulisLog("fg", `Berhasil digabung : ${berhasil} file`, "ok_b");
    tulisLog("fg", `Dilewati          : ${dilewati.length} file`, "skip_b");

    document.getElementById("fgLblOk").textContent = String(berhasil);
    document.getElementById("fgLblSkip").textContent = String(dilewati.length);
    document.getElementById("fgStatus").textContent = `Selesai: ${berhasil} Berhasil disimpan ke folder '${NAMA_FOLDER_COMBINE}', ${dilewati.length} dilewati.`;
  } catch (err) {
    alert("Error: " + err.message);
    document.getElementById("fgStatus").textContent = "Terjadi kesalahan.";
  } finally {
    setSibuk("fg", false);
  }
}
