const { PDFDocument } = PDFLib;

// ================= KONFIGURASI & REGEX (DARI config.py) =================
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

const POLA = /^(?:(?<kode>\d+)\s*-\s*)?(?<nama>.+?)\s+(?<jenis>INVOICE|INV|INVOCE|INVO|INVOICEE|REPORT|REP|REPORTT|LAP|LAPORAN|EMAIL|MAIL|EMAILL)\b(?<sisa>.*)\.pdf$/i;

// State penyimpanan file & ZIP hasil
let raFiles = [];
let raZipBlob = null;
let raZipName = "HASIL_COMPILE.zip";

let fgFiles = [];
let fgZipBlob = null;
let fgZipName = "COMBINE_FIGHTER.zip";

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
    document.getElementById("raBtnBuka").disabled = sibuk || !raZipBlob;
  } else {
    document.getElementById("fgBtnProses").disabled = sibuk;
    document.getElementById("fgBtnBersih").disabled = sibuk;
    document.getElementById("fgBtnBuka").disabled = sibuk || !fgZipBlob;
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function unduhHasilRA() {
  if (raZipBlob) triggerDownload(raZipBlob, raZipName);
}

function unduhHasilFighter() {
  if (fgZipBlob) triggerDownload(fgZipBlob, fgZipName);
}

// ================= HELPER STRING & PDF MERGE =================
function bersihkanNama(teks) {
  return teks.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}

function norm(teks) {
  return teks.replace(/\s+/g, " ").trim().toUpperCase();
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
// BAGIAN 1A: INSENTIF RA - MERGED PDF
// =========================================================================
async function mulaiProsesRA() {
  if (!raFiles.length) {
    alert("Silakan pilih folder terlebih dahulu.");
    return;
  }

  bersihkanLog("ra");
  raZipBlob = null;
  setSibuk("ra", true);

  try {
    // Filter hanya PDF dan abaikan folder HASIL_COMPILE
    const semuaPdf = raFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && !parts.includes(NAMA_FOLDER_HASIL);
    });

    if (semuaPdf.length === 0) {
      throw new Error("Tidak ada file PDF di folder ini.");
    }

    const sirkuler = semuaPdf.filter(f => f.name.toLowerCase().includes(KATA_KUNCI_SIRKULER));
    if (sirkuler.length === 0) {
      throw new Error("File Sirkuler tidak ditemukan.\nPastikan nama file mengandung kata 'Sirkuler'.");
    }

    const fileSirkuler = sirkuler[0];
    tulisLog("ra", `Sirkuler : ${fileSirkuler.name}\n`, "head");

    const data = {};
    for (const p of semuaPdf) {
      if (p === fileSirkuler) continue;
      const m = p.name.match(POLA);
      if (!m) continue;

      const jenisRaw = m.groups.jenis.toUpperCase();
      const jenisStandar = MAP_JENIS[jenisRaw] || jenisRaw;
      const sisa = m.groups.sisa || "";
      const kodeRaw = m.groups.kode || "";
      const namaRaw = m.groups.nama.trim();
      const kunciGrup = kodeRaw ? kodeRaw : norm(namaRaw);

      if (!data[kunciGrup]) data[kunciGrup] = [];
      data[kunciGrup].push({
        kode: kodeRaw,
        jenis: jenisStandar,
        nama: namaRaw,
        sisa: sisa.trim(),
        file: p
      });
    }

    const zip = new JSZip();
    const outFolder = zip.folder(NAMA_FOLDER_HASIL);
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
      const kd = items[0].kode;
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
        const prefix = ref.kode ? `${ref.kode} - ` : "";
        const sisaTeks = ref.sisa ? ` ${ref.sisa}` : "";
        const namaOutput = bersihkanNama(`${prefix}${ref.nama} COMPILE${sisaTeks}`) + ".pdf";

        outFolder.file(namaOutput, bytes);
        berhasil++;
        tulisLog("ra", `[OK]       ${namaOutput}  (${pageCount} halaman)`, "ok");
      } catch (err) {
        dilewati.push(`${label}: gagal diproses (${err.message})`);
        tulisLog("ra", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
      }
    }

    if (berhasil > 0) {
      document.getElementById("raStatus").textContent = "Membuat arsip ZIP...";
      raZipBlob = await zip.generateAsync({ type: "blob" });
      raZipName = `${NAMA_FOLDER_HASIL}.zip`;
      unduhHasilRA();
    }

    document.getElementById("raLblOk").textContent = String(berhasil);
    document.getElementById("raLblSkip").textContent = String(dilewati.length);
    document.getElementById("raStatus").textContent = `Selesai: ${berhasil} Berhasil, ${dilewati.length} dilewati.`;
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

  bersihkanLog("ra");
  raZipBlob = null;
  setSibuk("ra", true);

  try {
    // Subfolder JV berada tepat di dalam folder utama (depth = 3: Root/JV/file.pdf)
    const pdfJvs = raFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 3 && parts[1].toUpperCase() === NAMA_FOLDER_INPUT_JV;
    });

    if (pdfJvs.length === 0) {
      throw new Error(`Subfolder '${NAMA_FOLDER_INPUT_JV}' tidak ditemukan atau kosong.`);
    }

    // PDF IRES berada di root folder utama (depth = 2: Root/file.pdf)
    const pdfCompiles = raFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 2;
    });

    const fileJvs = pdfJvs.map(ekstrakInfoPdf);
    const daftarIres = pdfCompiles.map(ekstrakInfoPdf);

    const zip = new JSZip();
    const outFolder = zip.folder(NAMA_FOLDER_COMBINE);
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
        outFolder.file(namaOutput, bytes);
        berhasil++;
        tulisLog("ra", `[OK]       ${namaOutput} (${pageCount} hal)`, "ok");
      } catch (err) {
        dilewati.push(`${infoJv.namaAsli}: ${err.message}`);
        tulisLog("ra", `[DILEWATI] ${dilewati[dilewati.length - 1]}`, "skip");
      }
    }

    if (berhasil > 0) {
      raZipBlob = await zip.generateAsync({ type: "blob" });
      raZipName = `${NAMA_FOLDER_COMBINE}_JV.zip`;
      unduhHasilRA();
    }

    document.getElementById("raLblOk").textContent = String(berhasil);
    document.getElementById("raLblSkip").textContent = String(dilewati.length);
    document.getElementById("raStatus").textContent = `Selesai JV: ${berhasil} Berhasil.`;
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

  bersihkanLog("fg");
  fgZipBlob = null;
  setSibuk("fg", true);

  try {
    const folderAbaikan = new Set(["JV", "COMBINE", "HASIL_COMPILE"]);

    // 1. Ambil file JV di Root/JV/*.pdf
    const jvs = fgFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 3 && parts[1].toUpperCase() === NAMA_FOLDER_INPUT_JV;
    });

    // 2. Ambil file Trade In / Sirkuler (tipe 7) di Root/*.pdf
    const t7Files = fgFiles.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      return f.name.toLowerCase().endsWith(".pdf") && parts.length === 2 && klasifikasiFighter(f.name) === 7;
    });

    // 3. Kelompokkan struktur folder Dealer / Unit
    const dealerMap = {}; // { dealerName: { rootFiles: [], units: { unitName: [] } } }
    for (const f of fgFiles) {
      if (!f.name.toLowerCase().endsWith(".pdf")) continue;
      const parts = f.webkitRelativePath.split("/");
      if (parts.length < 3) continue; // Abaikan file langsung di root

      const dealerName = parts[1];
      if (folderAbaikan.has(dealerName.toUpperCase())) continue;

      if (!dealerMap[dealerName]) {
        dealerMap[dealerName] = { rootFiles: [], units: {} };
      }

      if (parts.length === 3) {
        // Root/Dealer/file.pdf
        dealerMap[dealerName].rootFiles.push(f);
      } else if (parts.length >= 4) {
        // Root/Dealer/Unit/file.pdf
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

    const zip = new JSZip();
    const outFolder = zip.folder(NAMA_FOLDER_COMBINE);
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
        outFolder.file(namaOutput, bytes);

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

    if (berhasil > 0) {
      fgZipBlob = await zip.generateAsync({ type: "blob" });
      fgZipName = `${NAMA_FOLDER_COMBINE}_FIGHTER.zip`;
      unduhHasilFighter();
    }

    document.getElementById("fgLblOk").textContent = String(berhasil);
    document.getElementById("fgLblSkip").textContent = String(dilewati.length);
    document.getElementById("fgStatus").textContent = `Selesai: ${berhasil} Berhasil, ${dilewati.length} dilewati.`;
  } catch (err) {
    alert("Error: " + err.message);
    document.getElementById("fgStatus").textContent = "Terjadi kesalahan.";
  } finally {
    setSibuk("fg", false);
  }
}
