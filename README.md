# Decal Unwrap

Paint a surface on your 3D model, press **Unwrap**, and get true-scale (1:1) 2D cut templates to print, cut out and stick on your 3D print — like a UV unwrap in Blender, but sized in millimetres for paper.

**Open the app: https://decal.vdthe.com/**

- Opens STL, OBJ, 3MF, PLY and GLB files, or makes one: scan or photograph a drawing on paper (A3–A6, B5, Letter, Legal) and get a 3D plate of the drawn shapes at 1:1 (also as STL).
- Paint tools: brush, fill (stops at sharp edges and raised ridges), erase, block (exclusion zone) and cut (mark your own slits).
- Splits the surface into low-stretch pieces, nests them on A2–A6, Letter, Legal, Tabloid or a custom size, and cuts pieces that are too long for the paper.
- Exports print, PDF, SVG (for cutting machines) and DXF.
- Artwork on the decals: your own images or built-in carbon, leather, metal and wood textures, with bleed past the cut line.
- Seam alignment marks and optional glue tabs, so pieces line up.
- Save and open whole projects (.decal files).
- Paste images (Ctrl+V) or drag and drop them.
- English and Vietnamese.

## Privacy

Everything runs in your browser. Your 3D files are never uploaded, stored or shared: there is no server behind this app. No account, no cookies, no analytics. The page only downloads its code libraries (three.js, jsPDF, Clipper) from jsDelivr and cdnjs and its fonts from Google Fonts; once it has loaded, it works without an internet connection.

## Development

No dependencies besides Node 18+. The app is one HTML page assembled from `src/`.

- `node build.mjs` writes `dist/decal-unwrap.html` (open it in Chrome / Edge) and `dist/artifact.html`.
- `node build.mjs --site` also refreshes `index.html`, the page GitHub Pages serves at https://decal.vdthe.com/.
- `node serve.mjs` serves `dist/` at http://localhost:5178/.
- Tests: `node tests/scan.test.mjs`, `node tests/flat.test.mjs`, `node tests/layout.test.mjs`, `node tests/seams.test.mjs`, `node tests/project.test.mjs`, `node tests/tube.mjs`.

Source: `src/geometry.js` (loading, welding), `src/flatten.js` (unwrap: seams, LSCM / ARAP, charts), `src/layout.js` (nesting, seam marks, tabs, SVG / PDF / DXF), `src/project.js` (.decal files), `src/scan.js` (paper scan: sheet detection, perspective, ink, contours), `src/app.js` (UI), `src/shell.html` + `src/styles.css`, textures in `src/assets/`.

## Printing at true size

In the print dialog choose **Scale 100% / Actual size** and turn **Fit to page off**, then measure the 50 mm ruler on the printed sheet.

---

## Tiếng Việt

Tô vùng bề mặt trên mô hình 3D, bấm **Trải phẳng**, app tạo mẫu cắt 2D đúng tỉ lệ 1:1 để in, cắt và dán lên bản in 3D.

- **Mở app:** https://decal.vdthe.com/
- **Quyền riêng tư:** mọi xử lý đều chạy trong trình duyệt. File 3D không bao giờ bị tải lên máy chủ nào. Sau khi trang tải xong, app dùng được cả khi không có mạng.
- **Khi in:** chọn Scale 100% (Actual size), tắt Fit to page, rồi đo thước 50 mm để kiểm tra.

Provided as is, without warranty. Always test-fit a piece before cutting your final material.
