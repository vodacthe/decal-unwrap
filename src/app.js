// ---------------------------------------------------------------------------
// App: three.js viewer, paint tools, generate, 2D preview, print / export.
// ---------------------------------------------------------------------------
(() => {
  const $ = (id) => document.getElementById(id);
  const GROUP_COLORS = ['#000000', '#e5484d', '#3e8ef7', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#a1887f'];
  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');

  // ----------------------------------------------------------------- i18n ---
  // English is the default. Static page text carries data-i18n keys; dynamic
  // text goes through i18n(key, vars). Flat / Layout / Geo get the language too.
  const I18N = {
    en: {
      'brand.sub': 'Flatten 3D surfaces into cut templates',
      'h.model': 'Model', 'drop.title': 'Open 3D file…', 'drop.sub': 'or drop it on the 3D view · STL, OBJ, 3MF, PLY, GLB',
      'demo.panel': 'Sample panel', 'demo.cyl': 'Sample tube', 'lbl.units': 'Units', 'lbl.up': 'Up',
      'h.tools': 'Paint tools', 'aria.tool': 'Tool',
      'tool.brush': 'Brush', 'tool.fill': 'Fill', 'tool.erase': 'Erase', 'tool.block': 'Block', 'tool.cut': 'Cut', 'tool.orbit': 'Orbit',
      'title.block': 'Paint an exclusion zone: brush and fill never select or spread into it (X)',
      'title.cut': 'Mark a cut: click points along the surface; the decal is slit along this line (C)',
      'lbl.brush': 'Brush', 'lbl.sharp': 'Sharp edge',
      'chk.cone': 'Same direction ≤',
      'lbl.cone': 'Max angle from the clicked face', 'chk.stopSharp': 'Stop at sharp edges', 'chk.front': 'Facing camera only',
      'hints.title': 'Mouse & shortcuts',
      'hint.lmb': 'Left mouse', 'hint.lmbD': 'paint / fill', 'hint.rmb': 'Right mouse', 'hint.rmbD': 'orbit',
      'hint.mmb': 'Middle, Shift + right', 'hint.mmbD': 'pan', 'hint.wheel': 'Wheel', 'hint.wheelD': 'zoom',
      'hint.space': 'Hold Space', 'hint.spaceD': 'orbit with the left button', 'hint.shift': 'Hold Shift while painting', 'hint.shiftD': 'erase',
      'hint.x': 'X (Block)', 'hint.xD': 'paint an exclusion zone; hold Shift to unblock',
      'hint.c': 'C (Cut)', 'hint.cD': 'click points to draw a slit; double-click, Enter or Esc ends it; Shift+click removes',
      'hint.bracketD': 'smaller / larger brush', 'hint.numD': 'pick decal group', 'hint.undoD': 'undo / redo',
      'h.groups': 'Decal groups', 'note.groups': 'Each group prints as its own pieces. Touching areas painted in different colours are always cut apart.',
      'aria.groups': 'Pick a group', 'btn.grow': 'Grow', 'btn.shrink': 'Shrink', 'btn.clearGroup': 'Clear', 'btn.clearAll': 'Clear all',
      'btn.unblock': 'Unblock all', 'btn.removeCuts': 'Remove cuts', 'btn.undo': '↶ Undo', 'btn.redo': '↷ Redo', 'btn.reset': '↺ Reset',
      'title.reset': 'Clear paint, blocks, cuts and the unwrap result (Ctrl+Z brings them back)',
      'h.unwrap': 'Unwrap', 'chk.islands': 'UV pieces, stretch ≤', 'lbl.stretch': 'Max stretch per piece', 'lbl.quality': 'Quality',
      'q.fast': 'Fast', 'q.standard': 'Standard', 'q.high': 'High', 'chk.autoSeam': 'Auto seams',
      'note.view': 'Pieces are rotated to match the current view, so turn the model the way you want it before you press Unwrap.',
      'btn.generate': 'Unwrap · Generate', 'btn.cancel': 'Cancel',
      'h.printNote': 'Print at true size',
      'print.note': 'Print at <b>Scale 100%</b> (Actual size) with <b>Fit to page off</b>, then measure the 50 mm ruler.',
      'print.artifact': 'This shared page cannot open the print dialog. Use <b>PDF</b> and print it at Actual size.',
      'h.export': 'Export', 'btn.print': 'Print…', 'btn.pdf': 'PDF', 'btn.svg': 'SVG', 'btn.dxf': 'DXF',
      'h.paper': 'Paper', 'lbl.paper': 'Paper', 'opt.custom': 'Custom…', 'lbl.orientation': 'Orientation',
      'opt.auto': 'Auto', 'opt.portrait': 'Portrait', 'opt.landscape': 'Landscape', 'lbl.width': 'W mm', 'lbl.height': 'H mm',
      'lbl.margin': 'Margin', 'lbl.gap': 'Gap', 'lbl.overlap': 'Overlap',
      'h.pieces': 'Pieces', 'lbl.rotation': 'Rotate', 'opt.view': 'Like 3D view', 'opt.optimize': 'Save paper',
      'lbl.offset': 'Offset', 'help.offset': 'Negative shrinks the decal so it never overhangs the edge; positive grows it.',
      'chk.mirror': 'Mirror (print on the back / transfer paper)',
      'chk.splitLong': 'Cut oversize pieces to fit the paper',
      'h.lines': 'Lines', 'lbl.lineWidth': 'Cut line', 'chk.fill': 'Fill', 'aria.fillColour': 'Fill colour',
      'chk.folds': 'Creases ≥', 'lbl.crease': 'Crease angle', 'chk.clean': 'Clean outlines',
      'chk.labels': 'Piece numbers', 'chk.ruler': '50 mm ruler',
      'h.preview': 'Preview', 'chk.heatmap': 'Stretch map (screen only)', 'lbl.zoom': 'Zoom', 'h.list': 'Pieces list',
      'title.brushT': 'Brush (B)', 'title.fillT': 'Fill a smooth area (F)', 'title.eraseT': 'Erase (E)',
      'title.orbitT': 'Orbit the view (V)', 'title.cone': 'Only faces facing the same way as the click: stays off raised ridges and fillets', 'title.undo': 'Undo (Ctrl+Z)',
      'title.redo': 'Redo (Ctrl+Y)', 'title.grow': 'Grow the current group by one ring of faces', 'title.shrink': 'Shrink the current group by one ring of faces',
      'title.clearGroup': 'Clear the current group', 'title.clearAll': 'Clear all groups', 'title.islands': 'Split the surface into low-stretch pieces, like a UV unwrap',
      'title.autoSeam': 'Cut tubes and closed shapes open automatically', 'title.pdf': 'Download PDF', 'title.svg': 'SVG for cutting machines',
      'title.dxf': 'Download DXF', 'title.margin': 'Page margin (mm)', 'title.gap': 'Gap between pieces (mm)',
      'title.overlap': 'Overlap when a piece is tiled over several sheets (mm)', 'title.splitLong': 'Pieces longer than the paper are cut into parts (at corners where possible) and nested on the same sheet, instead of being tiled over several sheets', 'title.offset': 'Cut line offset (mm). Negative shrinks the decal so it never overhangs the edge; positive grows it.',
      'privacy.short': '<b>100% local.</b> Your 3D files never leave this device.',
      'privacy.link': 'Privacy',
      'privacy.title': 'Privacy & disclaimer',
      'btn.close': 'Close',
      'privacy.body': '<h3>Your files stay on your device</h3><ul><li>3D models you open are read and processed only inside this browser tab. They are never uploaded, stored or shared: there is no server behind this app.</li><li>Painting, unwrapping and exporting (print, PDF, SVG, DXF) all run on your computer. Once the page has loaded, it keeps working without an internet connection.</li><li>No account, no cookies, no analytics or tracking. The only thing remembered is your language choice, saved in this browser.</li><li>When the page opens, your browser downloads its code libraries (three.js, jsPDF, Clipper) from jsDelivr and cdnjs, and its fonts from Google Fonts. Like the host of this website, these services see an ordinary page request (such as your IP address), never your files.</li></ul><h3>Disclaimer</h3><p>This tool is provided “as is”, without warranty of any kind. Always measure the 50 mm ruler after printing and test-fit a piece before you cut your final material. You are responsible for how you use the templates.</p>',
      'btn.saveProject': 'Save project',
      'title.saveProject': 'Save the model, painting, cut lines and settings as one .decal file',
      'btn.openProject': 'Open project',
      'title.openProject': 'Open a .decal project file',
      'msg.projOpened': 'Opened project {name}. Press Unwrap to make the pieces again.',
      'msg.projBad': 'Could not open the project: {e}',
      'msg.projMismatch': 'The painting in this project does not match its model.',
      'msg.restoreOffer': 'You painted this model before in this browser.',
      'btn.restore': 'Restore painting',
      'lbl.bleed': 'Bleed mm',
      'title.bleed': 'Colour and artwork run this far past the cut line, so a slightly off cut never shows a white edge',
      'chk.tabs': 'Glue tabs',
      'lbl.tabWidth': 'Tab width (mm)',
      'title.tabs': 'Adds flaps along one side of every seam, to glue under the neighbouring piece',
      'chk.seamMarks': 'Seam marks',
      'title.seamMarks': 'Matching ticks and letters on both sides of every seam, so pieces line up',
      'h.art': 'Artwork',
      'art.pick': 'Click a piece on the sheet',
      'art.selected': 'Piece #{id}',
      'btn.artAdd': 'Image…',
      'title.artAdd': 'Add an image (PNG, JPG, SVG, WebP) to the selected piece',
      'btn.artFit': 'Fit',
      'title.artFit': 'Show the whole image inside the piece',
      'btn.artFill': 'Fill',
      'title.artFill': 'Cover the whole piece with the image',
      'btn.artRemove': 'Remove',
      'title.artRemove': 'Remove the image from this piece',
      'lbl.artSize': 'Width mm',
      'lbl.artRot': 'Rotate °',
      'lbl.artOp': 'Opacity %',
      'chk.artTile': 'Repeat as pattern',
      'title.artTile': 'Repeat the image as a pattern (carbon, camo…)',
      'btn.artAll': 'Apply to all pieces',
      'title.artAll': 'Use this image on every piece',
      'msg.artBad': 'Could not read that image.',
      'lbl.texture': 'Built-in texture',
      'title.texture': 'Built-in texture, repeated as a pattern',
      'tex.pick': 'Texture…',
      'tex.carbon': 'Carbon fiber',
      'tex.leather': 'Leather',
      'tex.wood': 'Wood',
      'tex.metal': 'Metal',
      'tex.leather1': 'Leather 1',
      'tex.leather2': 'Leather 2',
      'tex.leather3': 'Leather 3',
      'tex.leather4': 'Leather 4',
      'tex.metal1': 'Metal 1',
      'tex.metal2': 'Metal 2',
      'tex.metal3': 'Metal 3',
      'tex.metal4': 'Metal 4',
      'tex.wood1': 'Wood 1',
      'tex.wood2': 'Wood 2',
      'tex.wood3': 'Wood 3',
      'tex.wood4': 'Wood 4',
      'btn.scan': 'Scan paper → 3D…',
      'title.scan': 'Photograph or scan a drawing on paper and turn it into a 3D plate at 1:1',
      'scan.title': 'Scan paper → 3D',
      'scan.hint': 'Draw or trace the shape with a dark pen. Scan the page, or photograph the <b>whole sheet</b> on a dark surface. A closed line is the edge of the part; a closed line inside it becomes a hole. You can also <b>paste</b> an image (Ctrl+V) or <b>drop</b> it here.',
      'scan.pick': 'Choose image…',
      'scan.mode': 'Drawing',
      'scan.outline': 'Outline',
      'scan.filled': 'Filled shapes',
      'scan.corners': 'Drag the dots onto the corners of the sheet',
      'scan.none': 'No image yet',
      'scan.nothing': 'No closed shape found. Check the corners, the paper size or the sensitivity.',
      'scan.stats': '{n} shape(s) · {w} × {h} mm · pen {pen} mm',
      'scan.sens': 'Sensitivity',
      'title.scanSens': 'Higher picks up fainter lines (and more smudges)',
      'scan.thick': 'Thickness mm',
      'scan.min': 'Ignore below mm²',
      'title.scanMin': 'Marks smaller than this are ignored (mm²)',
      'scan.stl': 'Download STL',
      'scan.use': 'Open in 3D',
      'msg.scanOpened': 'Made a 3D plate from {n} shape(s) at 1:1.',
      'btn.modelStl': 'Download STL',
      'title.modelStl': 'Download the open model as STL (mm)',
      'view.dims': 'Size',
      'title.dims': 'Show the model\'s length, width and height in mm',
      'view.measure': 'Measure',
      'title.measure': 'Click two points on the model to measure the distance (snaps to corners). Esc clears.',
      'dims.grid': 'grid square = 10 mm',
      'msg.measureHint': 'Click two points on the model. Points near a corner snap to it; Esc clears.',
      'msg.measured': 'Distance: {d}',
      'scan.realW': 'True width mm',
      'scan.realH': 'True height mm',
      'title.scanReal': 'Measured the real part and it differs? Enter its true width and/or height; the result is scaled to match',
      'scan.corrected': '(measured {w} × {h}, scaled ×{fx} / ×{fy})',
      'scan.auto': 'Auto',
      'scan.corner': 'Round corners mm',
      'title.scanCorner': 'Rounds the corners of the outline seen from above (outer and inner corners)',
      'scan.edge': 'Round edges mm',
      'title.scanEdge': 'Rounds the plate edge instead of a square 90° edge; the outline size stays the same',
      'scan.edgeTop': 'Top only',
      'scan.edgeBoth': 'Top & bottom',
      'scan.edgeMax': 'edge radius limited to {r} mm by the thickness',
      'scan.edgeReduced': 'edge radius reduced on thin parts',
      'aria.controls': 'Controls', 'aria.mode': 'Mode', 'aria.language': 'Language', 'aria.view': 'View',
      'tab.3d': '① Select surface (3D)', 'tab.2d': '② Print layout (2D)',
      'view.pieces': 'Show pieces', 'view.front': 'Front', 'view.back': 'Back', 'view.left': 'Left', 'view.right': 'Right',
      'view.top': 'Top', 'view.bottom': 'Bottom', 'view.fit': 'Fit',
      'title.fit': 'Fit camera to the model', 'aria.cube': 'View cube: click a face, edge or corner to look from there; drag it to orbit',
      'empty3d.title': 'Drop an STL, OBJ, 3MF, PLY or GLB file here', 'empty3d.sub': 'or use “Open 3D file…” on the left', 'dropveil': 'Drop to open',
      'empty2d.title': 'Nothing unwrapped yet', 'empty2d.sub': 'Paint a surface in the 3D tab, then press <b>Unwrap · Generate</b>.',
      // dynamic
      'msg.unitsCleared': 'The face count changed with the new units, so the painting was cleared.',
      'info.none': 'No model loaded', 'info.sample': ' (sample)', 'info.triangles': 'triangles',
      'msg.slow': 'The model has {n} triangles, so painting may be slow.', 'msg.reading': 'Reading {name}…',
      'msg.opened': 'Opened {name}. If the size looks wrong, check the units and the up axis.', 'msg.readFail': 'Could not read the file.',
      'msg.reset': 'Reset: paint, blocks and cuts cleared. Press Ctrl+Z to bring them back.',
      'cuts.count': 'Cuts: {n} edges', 'cuts.none': 'Cuts: none',
      'msg.cutSeparate': 'These two points are on separate parts of the model, so they cannot be joined by a cut.',
      'hud.orbitSpace': 'Orbit (Space)', 'hud.cutNext': 'click the next point · double-click / Enter: finish',
      'hud.cutStart': 'click where the cut starts · Shift+click: remove cuts', 'hud.block': 'paint exclusion zone (Shift: unblock)',
      'hud.erase': 'erase paint', 'hud.group': 'Group {g}', 'hud.orbitMouse': 'left: orbit · right: pan', 'hud.paintMouse': 'right: orbit · wheel: zoom',
      'chip.aria': 'Group {g}, {n} faces', 'blocked.count': 'Blocked: {n} faces', 'blocked.none': 'Blocked: none',
      'progress.preparing': 'Preparing…', 'msg.noPieces': 'No pieces could be made.',
      'msg.unwrapped1': 'Unwrapped into 1 piece.', 'msg.unwrapped': 'Unwrapped into {n} pieces.',
      'msg.cancelled': 'Cancelled.', 'msg.unwrapFail': 'Unwrap failed: {e}', 'msg.layoutFail': 'Layout failed: {e}',
      'pill.good': 'Good', 'pill.ok': 'OK', 'pill.bad': 'Stretched',
      'page.caption': 'Page {i}/{n} · {paper} {orient}', 'orient.portrait': 'portrait', 'orient.landscape': 'landscape',
      'piece.seams1': '1 seam cut', 'piece.seams': '{n} seams cut', 'piece.tiled': 'tiled over {n} sheets', 'piece.rotated': 'rotated 90°',
      'piece.part': 'part {k} of {n} (cut to fit the paper)',
      'piece.page': 'page {p}', 'piece.title': '#{id} · Group {g}', 'piece.avg': 'stretch avg', 'piece.max': 'max',
      'msg.dlBlocked': 'Downloads are blocked on this page. Open the HTML file on your computer to download.',
      'msg.saved': 'Saved {f}', 'msg.saveFail': 'Could not save the file ({e}).', 'msg.downloaded': 'Downloaded {f}',
      'msg.nothingPrint': 'Nothing to print yet. Press Unwrap first.', 'msg.pdfFail': 'Could not create the PDF.',
    },
    vi: {
      'brand.sub': 'Trải phẳng bề mặt 3D thành mẫu cắt',
      'h.model': 'Mô hình', 'drop.title': 'Mở file 3D…', 'drop.sub': 'hoặc kéo thả vào khung 3D · STL, OBJ, 3MF, PLY, GLB',
      'demo.panel': 'Mẫu tấm cong', 'demo.cyl': 'Mẫu ống trụ', 'lbl.units': 'Đơn vị', 'lbl.up': 'Trục lên',
      'h.tools': 'Công cụ tô', 'aria.tool': 'Công cụ',
      'tool.brush': 'Cọ', 'tool.fill': 'Tô vùng', 'tool.erase': 'Tẩy', 'tool.block': 'Chặn', 'tool.cut': 'Cắt', 'tool.orbit': 'Xoay',
      'title.block': 'Vẽ vùng loại trừ: cọ và tô vùng không bao giờ chọn hay lan vào đây (X)',
      'title.cut': 'Đánh dấu vết cắt: bấm các điểm trên bề mặt; decal được xẻ dọc theo đường này (C)',
      'lbl.brush': 'Cỡ cọ', 'lbl.sharp': 'Cạnh sắc',
      'chk.cone': 'Cùng hướng ≤',
      'lbl.cone': 'Lệch tối đa so với chỗ bấm', 'chk.stopSharp': 'Dừng ở cạnh sắc', 'chk.front': 'Chỉ mặt nhìn thấy',
      'hints.title': 'Chuột & phím tắt',
      'hint.lmb': 'Chuột trái', 'hint.lmbD': 'tô / tô vùng', 'hint.rmb': 'Chuột phải', 'hint.rmbD': 'xoay mô hình',
      'hint.mmb': 'Chuột giữa, Shift + phải', 'hint.mmbD': 'kéo khung nhìn', 'hint.wheel': 'Lăn chuột', 'hint.wheelD': 'phóng to / thu nhỏ',
      'hint.space': 'Giữ Space', 'hint.spaceD': 'xoay bằng chuột trái', 'hint.shift': 'Giữ Shift khi tô', 'hint.shiftD': 'tẩy',
      'hint.x': 'X (Chặn)', 'hint.xD': 'vẽ vùng loại trừ; giữ Shift để bỏ chặn',
      'hint.c': 'C (Cắt)', 'hint.cD': 'bấm các điểm để vẽ vết xẻ; bấm đúp, Enter hoặc Esc để kết thúc; Shift+bấm để xóa',
      'hint.bracketD': 'giảm / tăng cỡ cọ', 'hint.numD': 'chọn nhóm decal', 'hint.undoD': 'hoàn tác / làm lại',
      'h.groups': 'Nhóm decal', 'note.groups': 'Mỗi nhóm in thành các mảnh riêng. Vùng tô liền nhau nhưng khác màu luôn được tách ra.',
      'aria.groups': 'Chọn nhóm', 'btn.grow': 'Mở rộng', 'btn.shrink': 'Thu hẹp', 'btn.clearGroup': 'Xóa nhóm', 'btn.clearAll': 'Xóa hết',
      'btn.unblock': 'Bỏ chặn hết', 'btn.removeCuts': 'Xóa vết cắt', 'btn.undo': '↶ Hoàn tác', 'btn.redo': '↷ Làm lại', 'btn.reset': '↺ Đặt lại',
      'title.reset': 'Xóa vùng tô, vùng chặn, vết cắt và kết quả trải phẳng (Ctrl+Z để lấy lại)',
      'h.unwrap': 'Trải phẳng', 'chk.islands': 'Tách mảnh, méo ≤', 'lbl.stretch': 'Độ méo tối đa mỗi mảnh', 'lbl.quality': 'Chất lượng',
      'q.fast': 'Nhanh', 'q.standard': 'Chuẩn', 'q.high': 'Cao', 'chk.autoSeam': 'Tự cắt nối',
      'note.view': 'Mảnh in sẽ quay theo góc nhìn hiện tại, nên xoay mô hình về hướng bạn muốn trước khi bấm Trải phẳng.',
      'btn.generate': 'Trải phẳng · Generate', 'btn.cancel': 'Hủy',
      'h.printNote': 'In đúng kích thước',
      'print.note': 'In ở <b>Scale 100%</b> (Actual size), <b>tắt Fit to page</b>, rồi đo thước 50 mm để kiểm tra.',
      'print.artifact': 'Trang chia sẻ này không mở được hộp thoại in. Hãy tải <b>PDF</b> rồi in ở Actual size.',
      'h.export': 'Xuất file', 'btn.print': 'In…', 'btn.pdf': 'PDF', 'btn.svg': 'SVG', 'btn.dxf': 'DXF',
      'h.paper': 'Giấy', 'lbl.paper': 'Khổ', 'opt.custom': 'Tùy chỉnh…', 'lbl.orientation': 'Hướng giấy',
      'opt.auto': 'Tự động', 'opt.portrait': 'Dọc', 'opt.landscape': 'Ngang', 'lbl.width': 'Rộng', 'lbl.height': 'Cao',
      'lbl.margin': 'Lề', 'lbl.gap': 'Cách', 'lbl.overlap': 'Chồng',
      'h.pieces': 'Mảnh', 'lbl.rotation': 'Xoay', 'opt.view': 'Theo 3D', 'opt.optimize': 'Tiết kiệm giấy',
      'lbl.offset': 'Bù nét', 'help.offset': 'Âm = co vào để decal không tràn mép; dương = nở ra.',
      'chk.mirror': 'Lật gương (in mặt sau / giấy chuyển nhiệt)',
      'chk.splitLong': 'Cắt mảnh quá khổ cho vừa giấy',
      'h.lines': 'Nét in', 'lbl.lineWidth': 'Nét cắt', 'chk.fill': 'Tô nền', 'aria.fillColour': 'Màu nền',
      'chk.folds': 'Nét gấp ≥', 'lbl.crease': 'Ngưỡng góc gấp', 'chk.clean': 'Làm sạch nét',
      'chk.labels': 'Số mảnh', 'chk.ruler': 'Thước 50 mm',
      'h.preview': 'Xem trước', 'chk.heatmap': 'Bản đồ độ méo (chỉ xem)', 'lbl.zoom': 'Thu phóng', 'h.list': 'Danh sách mảnh',
      'title.brushT': 'Cọ (B)', 'title.fillT': 'Tô cả vùng trơn (F)', 'title.eraseT': 'Tẩy (E)',
      'title.orbitT': 'Xoay khung nhìn (V)', 'title.cone': 'Chỉ chọn mặt cùng hướng với chỗ bấm: không leo lên gờ lồi, mép bo', 'title.undo': 'Hoàn tác (Ctrl+Z)',
      'title.redo': 'Làm lại (Ctrl+Y)', 'title.grow': 'Mở rộng nhóm hiện tại thêm một vòng mặt', 'title.shrink': 'Thu hẹp nhóm hiện tại một vòng mặt',
      'title.clearGroup': 'Xóa vùng tô của nhóm hiện tại', 'title.clearAll': 'Xóa vùng tô của tất cả các nhóm', 'title.islands': 'Tách bề mặt thành các mảnh ít méo, giống UV unwrap',
      'title.autoSeam': 'Tự cắt mở ống trụ và các mặt khép kín', 'title.pdf': 'Tải PDF', 'title.svg': 'SVG cho máy cắt',
      'title.dxf': 'Tải DXF', 'title.margin': 'Lề trang (mm)', 'title.gap': 'Khoảng cách giữa các mảnh (mm)',
      'title.overlap': 'Phần chồng mép khi một mảnh phải ghép nhiều tờ (mm)', 'title.splitLong': 'Mảnh dài hơn khổ giấy được cắt thành nhiều phần (ưu tiên cắt ở góc) và xếp chung một tờ, thay vì ghép nhiều tờ', 'title.offset': 'Bù đường cắt (mm). Âm = co vào để decal không tràn mép; dương = nở ra.',
      'privacy.short': '<b>Xử lý 100% trên máy.</b> File 3D không bị tải lên đâu cả.',
      'privacy.link': 'Quyền riêng tư',
      'privacy.title': 'Quyền riêng tư & miễn trừ trách nhiệm',
      'btn.close': 'Đóng',
      'privacy.body': '<h3>File của bạn không rời khỏi máy</h3><ul><li>Mô hình 3D bạn mở chỉ được đọc và xử lý ngay trong tab trình duyệt này. File không bao giờ bị tải lên, lưu trữ hay chia sẻ: ứng dụng này không có máy chủ xử lý nào phía sau.</li><li>Tô vùng, trải phẳng và xuất file (in, PDF, SVG, DXF) đều chạy trên máy bạn. Sau khi trang đã tải xong, app vẫn dùng được khi không có mạng.</li><li>Không cần tài khoản, không cookie, không theo dõi hay thống kê. Thứ duy nhất được ghi nhớ là ngôn ngữ bạn chọn, lưu trong trình duyệt này.</li><li>Khi mở trang, trình duyệt tải các thư viện (three.js, jsPDF, Clipper) từ jsDelivr và cdnjs, và phông chữ từ Google Fonts. Giống như nơi lưu trữ trang web này, các dịch vụ đó chỉ nhận một yêu cầu tải trang thông thường (ví dụ địa chỉ IP), không bao giờ nhận file của bạn.</li></ul><h3>Miễn trừ trách nhiệm</h3><p>Công cụ được cung cấp “nguyên trạng”, không kèm bất kỳ bảo đảm nào. Hãy luôn đo thước 50 mm sau khi in và dán thử một mảnh trước khi cắt vật liệu chính. Bạn tự chịu trách nhiệm về việc sử dụng các mẫu cắt.</p>',
      'btn.saveProject': 'Lưu dự án',
      'title.saveProject': 'Lưu mô hình, vùng tô, vết cắt và cài đặt thành một file .decal',
      'btn.openProject': 'Mở dự án',
      'title.openProject': 'Mở file dự án .decal',
      'msg.projOpened': 'Đã mở dự án {name}. Bấm Trải phẳng để tạo lại các mảnh.',
      'msg.projBad': 'Không mở được dự án: {e}',
      'msg.projMismatch': 'Vùng tô trong dự án không khớp với mô hình.',
      'msg.restoreOffer': 'Bạn đã tô mô hình này trước đây trên trình duyệt này.',
      'btn.restore': 'Khôi phục vùng tô',
      'lbl.bleed': 'In tràn mm',
      'title.bleed': 'Màu và hình in tràn ra ngoài đường cắt một đoạn, cắt lệch một chút cũng không lộ viền trắng',
      'chk.tabs': 'Mép dán',
      'lbl.tabWidth': 'Độ rộng mép dán (mm)',
      'title.tabs': 'Thêm mép dán dọc một bên của mỗi đường nối, để dán xuống dưới mảnh bên cạnh',
      'chk.seamMarks': 'Dấu căn chỉnh',
      'title.seamMarks': 'Vạch và chữ giống nhau ở hai bên mỗi đường nối, để ghép các mảnh cho khớp',
      'h.art': 'Hình in',
      'art.pick': 'Bấm chọn một mảnh trên tờ giấy',
      'art.selected': 'Mảnh #{id}',
      'btn.artAdd': 'Thêm ảnh…',
      'title.artAdd': 'Thêm ảnh (PNG, JPG, SVG, WebP) vào mảnh đang chọn',
      'btn.artFit': 'Vừa',
      'title.artFit': 'Hiện trọn ảnh bên trong mảnh',
      'btn.artFill': 'Phủ kín',
      'title.artFill': 'Phủ ảnh kín toàn bộ mảnh',
      'btn.artRemove': 'Xóa',
      'title.artRemove': 'Xóa ảnh khỏi mảnh này',
      'lbl.artSize': 'Rộng mm',
      'lbl.artRot': 'Xoay °',
      'lbl.artOp': 'Độ đậm %',
      'chk.artTile': 'Lặp thành hoa văn',
      'title.artTile': 'Lặp ảnh thành hoa văn (carbon, rằn ri…)',
      'btn.artAll': 'Áp dụng cho mọi mảnh',
      'title.artAll': 'Dùng ảnh này cho tất cả các mảnh',
      'msg.artBad': 'Không đọc được ảnh này.',
      'lbl.texture': 'Vân có sẵn',
      'title.texture': 'Vân có sẵn, tự lặp thành hoa văn',
      'tex.pick': 'Vân…',
      'tex.carbon': 'Sợi carbon',
      'tex.leather': 'Da',
      'tex.wood': 'Gỗ',
      'tex.metal': 'Kim loại',
      'tex.leather1': 'Da 1',
      'tex.leather2': 'Da 2',
      'tex.leather3': 'Da 3',
      'tex.leather4': 'Da 4',
      'tex.metal1': 'Kim loại 1',
      'tex.metal2': 'Kim loại 2',
      'tex.metal3': 'Kim loại 3',
      'tex.metal4': 'Kim loại 4',
      'tex.wood1': 'Gỗ 1',
      'tex.wood2': 'Gỗ 2',
      'tex.wood3': 'Gỗ 3',
      'tex.wood4': 'Gỗ 4',
      'btn.scan': 'Scan giấy → 3D…',
      'title.scan': 'Chụp hoặc scan hình vẽ trên giấy và biến thành tấm 3D đúng tỉ lệ 1:1',
      'scan.title': 'Scan giấy → 3D',
      'scan.hint': 'Vẽ hoặc đồ viền hình bằng bút đậm màu. Scan cả trang, hoặc chụp <b>trọn tờ giấy</b> đặt trên mặt bàn tối màu. Đường khép kín là mép của chi tiết; đường khép kín nằm bên trong sẽ thành lỗ. Bạn cũng có thể <b>dán</b> ảnh (Ctrl+V) hoặc <b>kéo thả</b> ảnh vào đây.',
      'scan.pick': 'Chọn ảnh…',
      'scan.mode': 'Kiểu vẽ',
      'scan.outline': 'Đồ viền',
      'scan.filled': 'Tô kín',
      'scan.corners': 'Kéo các chấm vào đúng 4 góc tờ giấy',
      'scan.none': 'Chưa có ảnh',
      'scan.nothing': 'Chưa thấy hình khép kín nào. Kiểm tra 4 góc, khổ giấy hoặc độ nhạy.',
      'scan.stats': '{n} hình · {w} × {h} mm · nét bút {pen} mm',
      'scan.sens': 'Độ nhạy',
      'title.scanSens': 'Cao hơn thì bắt được nét mờ (nhưng cũng dễ dính vết bẩn)',
      'scan.thick': 'Độ dày mm',
      'scan.min': 'Bỏ qua dưới mm²',
      'title.scanMin': 'Vết nhỏ hơn diện tích này (mm²) sẽ bị bỏ qua',
      'scan.stl': 'Tải STL',
      'scan.use': 'Mở trong 3D',
      'msg.scanOpened': 'Đã tạo tấm 3D từ {n} hình, đúng tỉ lệ 1:1.',
      'btn.modelStl': 'Tải STL',
      'title.modelStl': 'Tải mô hình đang mở dưới dạng STL (mm)',
      'view.dims': 'Kích thước',
      'title.dims': 'Hiện chiều dài, rộng, cao của mô hình theo mm',
      'view.measure': 'Đo',
      'title.measure': 'Bấm 2 điểm trên mô hình để đo khoảng cách (tự bắt vào góc). Esc để xóa.',
      'dims.grid': '1 ô lưới = 10 mm',
      'msg.measureHint': 'Bấm 2 điểm trên mô hình. Điểm gần góc sẽ tự bắt vào góc; Esc để xóa.',
      'msg.measured': 'Khoảng cách: {d}',
      'scan.realW': 'Rộng thật mm',
      'scan.realH': 'Cao thật mm',
      'title.scanReal': 'Đo vật thật thấy lệch? Nhập chiều rộng và/hoặc chiều cao thật; kết quả sẽ được co giãn cho khớp',
      'scan.corrected': '(đo được {w} × {h}, đã chỉnh ×{fx} / ×{fy})',
      'scan.auto': 'Tự động',
      'scan.corner': 'Bo góc mm',
      'title.scanCorner': 'Bo tròn các góc của hình nhìn từ trên (cả góc lồi và góc lõm)',
      'scan.edge': 'Bo cạnh mm',
      'title.scanEdge': 'Bo tròn mép tấm thay vì cạnh vuông 90°; kích thước nhìn từ trên giữ nguyên',
      'scan.edgeTop': 'Chỉ mặt trên',
      'scan.edgeBoth': 'Hai mặt',
      'scan.edgeMax': 'bo cạnh tối đa {r} mm theo độ dày',
      'scan.edgeReduced': 'đã giảm bo cạnh ở chỗ mảnh',
      'aria.controls': 'Bảng điều khiển', 'aria.mode': 'Chế độ', 'aria.language': 'Ngôn ngữ', 'aria.view': 'Góc nhìn',
      'tab.3d': '① Chọn bề mặt (3D)', 'tab.2d': '② Bản in (2D)',
      'view.pieces': 'Hiện mảnh', 'view.front': 'Trước', 'view.back': 'Sau', 'view.left': 'Trái', 'view.right': 'Phải',
      'view.top': 'Trên', 'view.bottom': 'Dưới', 'view.fit': 'Vừa khung',
      'title.fit': 'Đưa camera về vừa mô hình', 'aria.cube': 'Khối góc nhìn: bấm vào mặt, cạnh hoặc góc để nhìn từ hướng đó; kéo để xoay',
      'empty3d.title': 'Kéo thả file STL, OBJ, 3MF, PLY hoặc GLB vào đây', 'empty3d.sub': 'hoặc bấm “Mở file 3D…” ở cột bên trái', 'dropveil': 'Thả để mở',
      'empty2d.title': 'Chưa có bản trải phẳng', 'empty2d.sub': 'Tô bề mặt ở tab 3D rồi bấm <b>Trải phẳng · Generate</b>.',
      // dynamic
      'msg.unitsCleared': 'Số mặt thay đổi theo đơn vị mới nên vùng tô đã được xóa.',
      'info.none': 'Chưa có mô hình', 'info.sample': ' (mô hình mẫu)', 'info.triangles': 'tam giác',
      'msg.slow': 'Mô hình có {n} tam giác nên thao tác tô có thể chậm.', 'msg.reading': 'Đang đọc {name}…',
      'msg.opened': 'Đã mở {name}. Nếu kích thước chưa đúng, hãy kiểm tra đơn vị và trục hướng lên.', 'msg.readFail': 'Không đọc được file.',
      'msg.reset': 'Đã đặt lại: xóa vùng tô, vùng chặn và vết cắt. Nhấn Ctrl+Z để lấy lại.',
      'cuts.count': 'Vết cắt: {n} cạnh', 'cuts.none': 'Vết cắt: chưa có',
      'msg.cutSeparate': 'Hai điểm này thuộc hai phần rời nhau của mô hình nên không nối được bằng vết cắt.',
      'hud.orbitSpace': 'Xoay (Space)', 'hud.cutNext': 'bấm điểm tiếp theo · bấm đúp / Enter: kết thúc',
      'hud.cutStart': 'bấm chỗ bắt đầu vết cắt · Shift+bấm: xóa vết cắt', 'hud.block': 'vẽ vùng loại trừ (Shift: bỏ chặn)',
      'hud.erase': 'xóa vùng tô', 'hud.group': 'Nhóm {g}', 'hud.orbitMouse': 'trái: xoay · phải: kéo', 'hud.paintMouse': 'phải: xoay · lăn: zoom',
      'chip.aria': 'Nhóm {g}, {n} mặt', 'blocked.count': 'Vùng chặn: {n} mặt', 'blocked.none': 'Vùng chặn: chưa có',
      'progress.preparing': 'Đang chuẩn bị…', 'msg.noPieces': 'Không tạo được mảnh nào.',
      'msg.unwrapped1': 'Đã trải phẳng thành 1 mảnh.', 'msg.unwrapped': 'Đã trải phẳng thành {n} mảnh.',
      'msg.cancelled': 'Đã hủy.', 'msg.unwrapFail': 'Trải phẳng lỗi: {e}', 'msg.layoutFail': 'Dàn trang lỗi: {e}',
      'pill.good': 'Tốt', 'pill.ok': 'Chấp nhận', 'pill.bad': 'Méo nhiều',
      'page.caption': 'Trang {i}/{n} · {paper} {orient}', 'orient.portrait': 'dọc', 'orient.landscape': 'ngang',
      'piece.seams1': 'đã cắt 1 đường nối', 'piece.seams': 'đã cắt {n} đường nối', 'piece.tiled': 'ghép {n} tờ', 'piece.rotated': 'xoay 90°',
      'piece.part': 'phần {k}/{n} (cắt cho vừa giấy)',
      'piece.page': 'trang {p}', 'piece.title': '#{id} · Nhóm {g}', 'piece.avg': 'méo TB', 'piece.max': 'max',
      'msg.dlBlocked': 'Trang này chặn tải file. Hãy mở file HTML trên máy để tải.',
      'msg.saved': 'Đã lưu {f}', 'msg.saveFail': 'Không lưu được file ({e}).', 'msg.downloaded': 'Đã tải {f}',
      'msg.nothingPrint': 'Chưa có bản in. Hãy bấm Trải phẳng trước.', 'msg.pdfFail': 'Không tạo được PDF.',
    },
  };
  let lang = 'en';
  try { const saved = localStorage.getItem('decal-unwrap-lang'); if (saved === 'vi' || saved === 'en') lang = saved; } catch (e) { /* storage blocked */ }
  function i18n(key, vars) {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
    return s;
  }
  const fmtInt = (n) => n.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');

  const state = {
    raw: null, rawName: '', unitScale: 1, upAxis: 'y', isDemo: false,
    model: null, faceGroup: null, blocked: null, seams: null, geom: null, mesh: null,
    tool: 'brush', group: 1, brushR: 5, angle: 30, stopSharp: true, frontOnly: true, coneOn: true, cone: 10,
    undo: [], redo: [], pieces: null, flatWarnings: [], layout: null,
    generating: false, cancel: false,
  };
  const settings = {
    paper: 'A4', customW: 210, customH: 297, orientation: 'auto', margin: 10, gap: 4, overlap: 10,
    rotateMode: 'optimize', mirror: true, offset: 0, lineWidth: 0.25, fill: false, fillColor: '#ffd84d',
    folds: true, foldAngle: 30, labels: true, clean: true, calibration: true, heatmap: false, fileName: '', groupColors: GROUP_COLORS, lang: 'en', splitLong: true,
    seamMarks: true, bleed: 0, tabs: false, tabWidth: 5, artwork: {},
  };
  let zoom = 1.6;
  // artwork placed on pieces in the 2D layout (see the Artwork section); kept per flatten piece id
  let artworkStore = {};
  const artworkForSave = () => artworkStore;
  function artworkFromSave(a) { artworkStore = a && typeof a === 'object' ? a : {}; }

  // ---------------------------------------------------------------- toast ---
  let toastTimer = 0;
  // action: optional { label, fn } shown as a button inside the toast
  function toast(msg, kind = '', action = null) {
    const t = $('toast');
    t.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-btn';
      b.textContent = action.label;
      b.addEventListener('click', () => { t.hidden = true; action.fn(); });
      t.append(' ', b);
    }
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 12000 : kind === 'bad' ? 6000 : 3200);
  }

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#333';

  // --------------------------------------------------------------- three ---
  const host = $('canvas-host');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  camera.position.set(0, 100, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.14;
  controls.rotateSpeed = 0.8;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4250, 1.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  scene.add(rim);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  let grid = null, gridSize = 0;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }),
  );
  ring.renderOrder = 999;
  ring.visible = false;
  scene.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
  dot.renderOrder = 999; dot.visible = false; scene.add(dot);
  // fat-line materials for Cut-tool seams (resolution is kept in sync by resize())
  const seamMat = new LineMaterial({ color: 0xff3b30, linewidth: 3, worldUnits: false, depthTest: true });
  const previewMat = new LineMaterial({ color: 0xffb020, linewidth: 2, worldUnits: false, depthTest: true });

  function applyTheme() {
    scene.background = new THREE.Color(cssVar('--viewport'));
    if (grid) buildGrid();
  }
  applyTheme();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old browsers */ }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    seamMat.resolution.set(w, h);
    previewMat.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  renderer.setAnimationLoop((now) => {
    stepCamAnim(now);
    controls.update();
    key.position.copy(camera.position).add(new THREE.Vector3(0, camera.position.length() * 0.3, 0));
    rim.position.copy(camera.position).multiplyScalar(-1);
    flushColors();
    renderer.render(scene, camera);
    placePieceTags();
    drawOverlay();
    renderGizmo();
  });

  // three-mesh-bvh (optional, speeds up picking on big models)
  let bvh = null;
  import('three-mesh-bvh').then((m) => {
    bvh = m;
    THREE.Mesh.prototype.raycast = m.acceleratedRaycast;
    if (state.geom && !state.geom.boundsTree) state.geom.boundsTree = new m.MeshBVH(state.geom);
  }).catch(() => { /* fall back to plain raycasting */ });

  // --------------------------------------------------------------- colors ---
  // Vertex colours live in linear space; convert the sRGB palette once.
  let colorTable = [], maskColors = [];
  function buildColorTable() {
    const base = Geo.BASE_COLOR;
    const toLin = (r, g, b) => { const c = new THREE.Color(); c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]; };
    colorTable = GROUP_COLORS.map((hex, g) => {
      if (g === 0) return toLin(base[0], base[1], base[2]);
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
      return toLin(r * 0.88 + base[0] * 0.12, gg * 0.88 + base[1] * 0.12, b * 0.88 + base[2] * 0.12);
    });
    // blocked faces alternate two slate tones so the mask reads as a hatch
    maskColors = [toLin(0x4a, 0x50, 0x59), toLin(0x6b, 0x72, 0x7c)];
  }
  buildColorTable();

  let dirtyMin = Infinity, dirtyMax = -1;
  function faceColor(f) {
    if (state.blocked[f]) return maskColors[f & 1];
    if (showPieces && pieceOf && pieceOf[f] >= 0) return pieceColors[pieceOf[f]];
    return colorTable[state.faceGroup[f]];
  }
  function writeColor(f) {
    const arr = state.geom.attributes.color.array, o = 9 * f;
    const c = faceColor(f);
    arr[o] = arr[o + 3] = arr[o + 6] = c[0];
    arr[o + 1] = arr[o + 4] = arr[o + 7] = c[1];
    arr[o + 2] = arr[o + 5] = arr[o + 8] = c[2];
    if (f < dirtyMin) dirtyMin = f;
    if (f > dirtyMax) dirtyMax = f;
  }
  function setFace(f, g) {
    if (state.faceGroup[f] === g || state.blocked[f]) return;
    state.faceGroup[f] = g;
    writeColor(f);
  }
  // Blocking a face also removes it from its decal group.
  function setBlock(f, on) {
    const v = on ? 1 : 0;
    if (state.blocked[f] === v) return;
    state.blocked[f] = v;
    if (v) state.faceGroup[f] = 0;
    writeColor(f);
  }
  // Colour edits accumulate into one dirty range (or a full upload) and are
  // sent to the GPU once per frame, so several edits between frames all land.
  let fullPending = false;
  function flushColors() {
    if (!state.geom || (!fullPending && dirtyMax < 0)) return;
    const attr = state.geom.attributes.color;
    attr.clearUpdateRanges();
    if (!fullPending) attr.addUpdateRange(9 * dirtyMin, 9 * (dirtyMax - dirtyMin + 1));
    attr.needsUpdate = true;
    fullPending = false;
    dirtyMin = Infinity; dirtyMax = -1;
  }
  function recolorAll() {
    const arr = state.geom.attributes.color.array, fg = state.faceGroup;
    for (let f = 0; f < fg.length; f++) {
      const c = faceColor(f), o = 9 * f;
      arr[o] = arr[o + 3] = arr[o + 6] = c[0];
      arr[o + 1] = arr[o + 4] = arr[o + 7] = c[1];
      arr[o + 2] = arr[o + 5] = arr[o + 8] = c[2];
    }
    fullPending = true;
  }

  // ------------------------------------------------------- piece overlay ---
  // After Unwrap, the 3D view can tint every piece and tag it with its number,
  // so printed pieces can be matched to where they go on the model.
  let showPieces = false, pieceOf = null, pieceColors = [], pieceAnchors = [];
  const tagHost = $('piece-labels');
  const tmpV = new THREE.Vector3();

  function buildPieceView() {
    const m = state.model;
    pieceOf = new Int32Array(m.nF).fill(-1);
    pieceColors = []; pieceAnchors = [];
    tagHost.innerHTML = '';
    state.pieces.forEach((p, i) => {
      const base = new THREE.Color(GROUP_COLORS[p.group]);
      const hsl = {};
      base.getHSL(hsl, THREE.SRGBColorSpace);
      const c = new THREE.Color().setHSL(
        (hsl.h + (((i * 0.618) % 1) - 0.5) * 0.16 + 1) % 1, Math.min(1, hsl.s * 0.85 + 0.1), 0.34 + 0.32 * ((i * 0.381) % 1), THREE.SRGBColorSpace,
      );
      pieceColors.push([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]);
      let cx = 0, cy = 0, cz = 0, a = 0, nx = 0, ny = 0, nz = 0;
      for (const f of p.faceIds) {
        pieceOf[f] = i;
        const w = m.fA[f];
        cx += m.fC[3 * f] * w; cy += m.fC[3 * f + 1] * w; cz += m.fC[3 * f + 2] * w;
        nx += m.fN[3 * f] * w; ny += m.fN[3 * f + 1] * w; nz += m.fN[3 * f + 2] * w; a += w;
      }
      cx /= a; cy /= a; cz /= a;
      // snap the tag onto the piece itself (its centroid may lie in a hole)
      let best = -1, bd = Infinity;
      for (const f of p.faceIds) {
        const d = (m.fC[3 * f] - cx) ** 2 + (m.fC[3 * f + 1] - cy) ** 2 + (m.fC[3 * f + 2] - cz) ** 2;
        if (d < bd) { bd = d; best = f; }
      }
      const el = document.createElement('span');
      el.className = 'piece-tag';
      el.textContent = `#${p.id}`;
      tagHost.appendChild(el);
      pieceAnchors.push({
        pos: new THREE.Vector3(m.fC[3 * best], m.fC[3 * best + 1], m.fC[3 * best + 2]),
        n: new THREE.Vector3(nx, ny, nz).normalize(), el,
      });
    });
  }

  function setShowPieces(on) {
    showPieces = !!on && !!(state.pieces && state.pieces.length && pieceOf);
    $('show-pieces').setAttribute('aria-pressed', String(showPieces));
    tagHost.hidden = !showPieces;
    if (state.geom) recolorAll();
  }

  // seam letters from the layout, shown on the model next to the piece numbers
  let seamAnchors = [], seamCamKey = '';
  function buildSeamTags() {
    for (const s of seamAnchors) s.el.remove();
    seamAnchors = [];
    seamCamKey = '';
    const L = state.layout;
    if (!L || !L.seams) return;
    for (const s of L.seams) {
      const el = document.createElement('span');
      el.className = 'piece-tag seam-tag';
      el.textContent = s.letter;
      tagHost.appendChild(el);
      seamAnchors.push({ pos: new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]), el, vis: false });
    }
  }

  function clearPieceView() {
    pieceOf = null; pieceAnchors = []; seamAnchors = []; tagHost.innerHTML = '';
    $('show-pieces').hidden = true;
    setShowPieces(false);
  }

  function placePieceTags() {
    if (!showPieces || currentTab !== '3d') return;
    const w = host.clientWidth, h = host.clientHeight;
    for (const t of pieceAnchors) {
      tmpV.copy(t.pos).sub(camera.position);
      const facing = t.n.dot(tmpV) < 0;
      tmpV.copy(t.pos).project(camera);
      const vis = facing && tmpV.z < 1 && Math.abs(tmpV.x) <= 1 && Math.abs(tmpV.y) <= 1;
      t.el.hidden = !vis;
      if (vis) { t.el.style.left = `${((tmpV.x + 1) / 2) * w}px`; t.el.style.top = `${((1 - tmpV.y) / 2) * h}px`; }
    }
    if (!seamAnchors.length || !state.mesh) return;
    // a seam letter shows only where the seam itself is in sight (re-checked when the camera moves)
    const key = camera.matrixWorld.elements.map((x) => x.toFixed(4)).join();
    const recheck = key !== seamCamKey;
    seamCamKey = key;
    const tol = state.model.bbox.diag * 0.01;
    for (const s of seamAnchors) {
      tmpV.copy(s.pos).project(camera);
      const inView = tmpV.z < 1 && Math.abs(tmpV.x) <= 1 && Math.abs(tmpV.y) <= 1;
      if (recheck) {
        s.vis = false;
        if (inView) {
          const dir = s.pos.clone().sub(camera.position);
          const dist = dir.length();
          raycaster.set(camera.position, dir.normalize());
          const hit = raycaster.intersectObject(state.mesh, false)[0];
          s.vis = !hit || hit.distance > dist - tol;
        }
      }
      s.el.hidden = !(inView && s.vis);
      if (!s.el.hidden) { s.el.style.left = `${((tmpV.x + 1) / 2) * w}px`; s.el.style.top = `${((1 - tmpV.y) / 2) * h}px`; }
    }
  }

  // ---------------------------------------------------------------- model ---
  function buildGrid() {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); grid = null; }
    if (!state.model) return;
    const s = state.model.bbox.size;
    const size = Math.max(20, Math.ceil((Math.max(s[0], s[2]) * 1.6) / 10) * 10);
    gridSize = size;
    grid = new THREE.GridHelper(size, Math.round(size / 10), new THREE.Color(cssVar('--grid-major')), new THREE.Color(cssVar('--grid-minor')));
    grid.position.y = -0.01;
    scene.add(grid);
  }

  function rebuildModel(keepGroups) {
    const model = Geo.buildModel(state.raw, { unitScale: state.unitScale, upAxis: state.upAxis, name: state.rawName });
    const keep = keepGroups && state.faceGroup && state.faceGroup.length === model.nF;
    const fg = keep ? state.faceGroup : new Uint8Array(model.nF);
    if (keepGroups && !keep && state.faceGroup && state.faceGroup.some((g) => g)) toast(i18n('msg.unitsCleared'));
    if (state.mesh) { scene.remove(state.mesh); state.geom.dispose(); }
    state.model = model;
    state.faceGroup = fg;
    state.blocked = keep && state.blocked && state.blocked.length === model.nF ? state.blocked : new Uint8Array(model.nF);
    state.seams = keep && state.seams && state.seams.length === model.nE ? state.seams : new Uint8Array(model.nE);
    vGraph = null; vNormals = null; cutLast = -1;
    if (!keep) { state.undo = []; state.redo = []; }
    const geom = Geo.buildDisplayGeometry(model, 30);
    if (bvh) geom.boundsTree = new bvh.MeshBVH(geom);
    state.geom = geom;
    state.mesh = new THREE.Mesh(geom, material);
    scene.add(state.mesh);
    recolorAll();
    stamp = new Int32Array(model.nF);
    stampId = 0;
    buildGrid();
    const d = model.bbox.diag;
    const bs = $('brush-size');
    bs.min = String(+(d / 300).toPrecision(2));
    bs.max = String(+(d / 4).toPrecision(2));
    bs.step = String(+(d / 3000).toPrecision(2));
    // 5 mm by default, kept inside the slider range for very small or large models
    state.brushR = Math.min(Number(bs.max), Math.max(Number(bs.min), 5));
    bs.value = String(state.brushR);
    syncBrushLabel();
    updateInfo();
    updateCounts();
    $('empty-3d').hidden = true;
    state.pieces = null; state.layout = null;
    measurePts = [];
    clearPieceView();
    showPreview([]);
    rebuildSeamLines();
    render2D();
  }

  function updateInfo() {
    const m = state.model;
    if (!m) { $('model-info').textContent = i18n('info.none'); return; }
    const s = m.bbox.size.map((x) => x.toFixed(1));
    const name = state.rawName.replace(/[<>&"]/g, '');
    $('model-info').innerHTML = `<b>${name}</b>${state.isDemo ? i18n('info.sample') : ''} · <span class="mono">${fmtInt(m.nF)}</span> ${i18n('info.triangles')} · <span class="mono">${s[0]} × ${s[1]} × ${s[2]}</span> mm`;
  }

  function loadRaw(triangles, name, upAxis, isDemo) {
    state.raw = triangles;
    state.rawName = name;
    state.upAxis = upAxis;
    state.isDemo = isDemo;
    $('up-axis').value = upAxis;
    rebuildModel(false);
    fitView('front');
    armAutosave();
    const n = state.model.nF;
    if (n > 1500000) toast(i18n('msg.slow', { n: fmtInt(n) }));
  }

  async function openFile(file) {
    if (!file) return;
    if (/\.decal$/i.test(file.name)) { openProject(file); return; }
    if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|avif|bmp|gif|heic)$/i.test(file.name)) { openScan(file); return; }
    toast(i18n('msg.reading', { name: file.name }));
    try {
      const r = await Geo.readFile(file, lang);
      state.unitScale = Number($('unit').value) || 1;
      loadRaw(r.triangles, r.name, r.defaultUp, false);
      if (!offerRestore()) toast(i18n('msg.opened', { name: r.name }));
    } catch (e) {
      console.error(e);
      toast(e && e.message ? e.message : i18n('msg.readFail'), 'bad');
    }
  }

  function loadDemo(kind) {
    state.unitScale = 1;
    $('unit').value = '1';
    if (kind === 'cyl') {
      loadRaw(Geo.demoCylinder(), 'sample-cylinder.stl', 'y', true);
    } else {
      loadRaw(Geo.demoPanel(), 'sample-curved-panel.stl', 'y', true);
      // pre-paint the front face below the display window into group 1
      const b = state.model.bbox;
      raycaster.set(new THREE.Vector3(0, b.size[1] * 0.18, b.max[2] + 50), new THREE.Vector3(0, 0, -1));
      const hits = raycaster.intersectObject(state.mesh, false);
      if (hits.length) {
        const f = Math.floor(hits[0].face.a / 3);
        bucketFill(f, 1, 12, new THREE.Vector3(0, b.size[1] * 0.4, b.max[2] + 2000), 180);
        updateCounts();
      }
    }
  }

  // ------------------------------------------------- size and measuring ----
  // An SVG layer over the 3D view: the model's bounding sizes in mm, and a
  // two-point measurement, so a scanned plate can be checked against the paper.
  const overlay = $('overlay-3d');
  let showDims = false, measuring = false, measurePts = [];
  const projV = new THREE.Vector3();
  function toScreen(p) {
    projV.copy(p).project(camera);
    return { x: ((projV.x + 1) / 2) * host.clientWidth, y: ((1 - projV.y) / 2) * host.clientHeight, ok: projV.z < 1 };
  }
  const fmtMm = (v) => `${v >= 100 ? v.toFixed(1) : v.toFixed(2)} mm`;
  // a dimension line between two 3D points with end ticks and a centred label
  function dimSvg(a, b, text, cls) {
    const p = toScreen(a), q = toScreen(b);
    if (!p.ok || !q.ok) return '';
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * 5, ny = (dx / l) * 5;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    return `<g class="${cls}"><line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`
      + `<line x1="${p.x - nx}" y1="${p.y - ny}" x2="${p.x + nx}" y2="${p.y + ny}"/><line x1="${q.x - nx}" y1="${q.y - ny}" x2="${q.x + nx}" y2="${q.y + ny}"/>`
      + `<text x="${mx}" y="${my - 6}">${text}</text></g>`;
  }
  function drawOverlay() {
    if (currentTab !== '3d' || !state.model || (!showDims && !measurePts.length)) { if (overlay.innerHTML) overlay.innerHTML = ''; return; }
    let svg = '';
    if (showDims) {
      const b = state.model.bbox, mn = new THREE.Vector3(...b.min), mx = new THREE.Vector3(...b.max), s = b.size;
      const o = Math.max(2, b.diag * 0.05);
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      svg += dimSvg(V(mn.x, mn.y, mx.z + o), V(mx.x, mn.y, mx.z + o), fmtMm(s[0]), 'dim');
      svg += dimSvg(V(mx.x + o, mn.y, mn.z), V(mx.x + o, mn.y, mx.z), fmtMm(s[2]), 'dim');
      svg += dimSvg(V(mx.x + o, mn.y, mx.z + o), V(mx.x + o, mx.y, mx.z + o), fmtMm(s[1]), 'dim');
      if (gridSize) {
        const g = toScreen(V(-gridSize / 2, 0, gridSize / 2));
        if (g.ok) svg += `<text class="grid-note" x="${g.x + 6}" y="${g.y + 16}">${i18n('dims.grid')}</text>`;
      }
    }
    if (measurePts.length) {
      const [a, b] = measurePts;
      for (const p of measurePts) { const q = toScreen(p); if (q.ok) svg += `<circle class="mpt" cx="${q.x}" cy="${q.y}" r="4"/>`; }
      if (b) svg += dimSvg(a, b, fmtMm(a.distanceTo(b)), 'measure');
    }
    overlay.innerHTML = svg;
  }
  // the clicked surface point, or the closest visible model corner within 12 px on screen
  function measureClick(e) {
    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    let p = hit.point.clone();
    const m = state.model, rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const hitDist = hit.point.distanceTo(camera.position), tol = m.bbox.diag * 0.01;
    const vp = new THREE.Vector3();
    let best = 12;
    for (let v = 0; v < m.nV; v++) {
      vp.set(m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]);
      // skip corners hidden behind the surface that was clicked
      if (vp.distanceTo(camera.position) > hitDist + tol) continue;
      const s = toScreen(vp);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < best) { best = d; p = vp.clone(); }
    }
    measurePts = measurePts.length >= 2 ? [p] : [...measurePts, p];
    if (measurePts.length === 2) toast(i18n('msg.measured', { d: fmtMm(measurePts[0].distanceTo(measurePts[1])) }));
  }
  function setDims(on) { showDims = !!on; $('show-dims').setAttribute('aria-pressed', String(showDims)); }
  function setMeasuring(on) {
    measuring = !!on;
    if (!measuring) measurePts = [];
    $('measure').setAttribute('aria-pressed', String(measuring));
    applyControlMode();
    if (measuring) toast(i18n('msg.measureHint'));
  }
  $('show-dims').addEventListener('click', () => setDims(!showDims));
  $('measure').addEventListener('click', () => setMeasuring(!measuring));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && measuring && measurePts.length) measurePts = []; });

  // ---------------------------------------------------------------- views ---
  // Frame the whole model, looking from a named view, from a direction vector,
  // or ('fit') from where the camera is now. `animate` glides there.
  let camAnim = null;
  function fitView(view, animate) {
    if (!state.model) return;
    const b = state.model.bbox;
    const center = new THREE.Vector3(0, b.size[1] / 2, 0);
    const radius = Math.max(1e-3, b.diag / 2);
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.2, camera.aspect));
    const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * 1.08;
    let dir;
    if (view === 'fit') dir = camera.position.clone().sub(controls.target);
    else if (view && view.isVector3) dir = view.clone();
    else dir = ({
      front: new THREE.Vector3(0, 0, 1), back: new THREE.Vector3(0, 0, -1), left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0), top: new THREE.Vector3(0, 1, 0), bottom: new THREE.Vector3(0, -1, 0),
    })[view] || new THREE.Vector3(0, 0, 1);
    if (!isFinite(dir.x + dir.y + dir.z) || dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
    dir.normalize();
    // Looking exactly straight down / up leaves the camera's roll undefined, so
    // tilt a hair: toward the front for named views, along the current heading for 'fit'.
    const flat = Math.hypot(dir.x, dir.z);
    if (flat < 1e-6) {
      const hx = view === 'fit' && flat > 0 ? dir.x / flat : 0, hz = view === 'fit' && flat > 0 ? dir.z / flat : 1;
      dir.set(hx * 1e-4, Math.sign(dir.y) || 1, hz * 1e-4).normalize();
    }
    const near = Math.max(0.01, dist / 200), far = dist * 50;
    if (!animate) {
      camAnim = null;
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      return;
    }
    const from = camera.position.clone().sub(controls.target);
    // keep both framings inside the clip range while gliding
    camera.near = Math.min(camera.near, near);
    camera.far = Math.max(camera.far, far);
    camera.updateProjectionMatrix();
    // Glide in orbit (spherical) coordinates, like OrbitControls itself: the
    // camera's roll follows the heading, so a straight slerp would spin the
    // image when the path passes over or ends at the top / bottom.
    const fromS = new THREE.Spherical().setFromVector3(from);
    const toS = new THREE.Spherical().setFromVector3(dir.clone().multiplyScalar(dist));
    const dTheta = toS.theta - fromS.theta;
    camAnim = {
      t0: undefined, fromS, toS, dTheta: Math.atan2(Math.sin(dTheta), Math.cos(dTheta)), // the short way round
      fromTarget: controls.target.clone(), toTarget: center, near, far,
    };
  }
  function stepCamAnim(now) {
    const a = camAnim;
    if (!a) return;
    // start the clock on the first frame: the frame time can be earlier than the click
    if (a.t0 === undefined) a.t0 = now;
    const t = Math.min(1, Math.max(0, (now - a.t0) / 420)), k = 1 - Math.pow(1 - t, 3);
    const s = new THREE.Spherical(
      a.fromS.radius + (a.toS.radius - a.fromS.radius) * k,
      a.fromS.phi + (a.toS.phi - a.fromS.phi) * k,
      a.fromS.theta + a.dTheta * k,
    );
    controls.target.lerpVectors(a.fromTarget, a.toTarget, k);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    if (t >= 1) {
      camAnim = null;
      camera.near = a.near;
      camera.far = a.far;
      camera.updateProjectionMatrix();
    }
  }
  controls.addEventListener('start', () => { camAnim = null; });

  // Turn the camera around the target (used when dragging the view cube).
  function orbitBy(dTheta, dPhi) {
    camAnim = null;
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += dTheta;
    sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 1e-3, Math.PI - 1e-3);
    camera.position.copy(controls.target).add(off.setFromSpherical(sph));
    camera.lookAt(controls.target);
  }

  // ------------------------------------------------------------ view cube ---
  // Bottom-left navigator: a cube that turns with the camera (click a face,
  // edge or corner to look from there, drag it to orbit) and the file's x / y / z
  // axes. It has its own small renderer so its pointer events never reach the
  // painting canvas.
  const gzCanvas = $('gizmo-canvas');
  let gzRenderer = null;
  try {
    gzRenderer = new THREE.WebGLRenderer({ canvas: gzCanvas, antialias: true, alpha: true });
    gzRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  } catch (e) {
    $('gizmo').hidden = true;
  }
  const GZ_S = 2.55;
  const gzScene = new THREE.Scene();
  const gzCam = new THREE.OrthographicCamera(-GZ_S, GZ_S, GZ_S, -GZ_S, 0.1, 30);
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const GZ_FACES = ['right', 'left', 'top', 'bottom', 'front', 'back'];
  const GZ_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((n) => new THREE.Vector3(...n));
  const gzMats = GZ_FACES.map(() => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const gzCube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), gzMats);
  gzScene.add(gzCube);
  gzScene.add(new THREE.LineSegments(new THREE.EdgesGeometry(gzCube.geometry), new THREE.LineBasicMaterial({ color: 0x15181d })));
  // hover marker: a thin slab over the face centre, edge or corner under the pointer
  const gzHl = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  gzHl.visible = false;
  gzScene.add(gzHl);
  const gzAxes = new THREE.Group();
  gzScene.add(gzAxes);
  const GZ_EDGE = 0.6; // |coordinate| beyond this on a face picks the edge / corner next to it
  let gzDirty = true, gzUp = '', gzHover = null, gzDrag = null, gzPointer = null;
  const gzLastQ = new THREE.Quaternion(0, 0, 0, 0);
  const gzRay = new THREE.Raycaster();
  const gzNdc = new THREE.Vector2();
  const gzLight = new THREE.Vector3(-0.45, 0.6, 0.66).normalize(); // from the viewer's upper left

  function gzFaceTexture(label) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#454a53';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255, 255, 255, .09)';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 236, 236);
    let fs = 64;
    const font = () => `600 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`;
    g.font = font();
    while (g.measureText(label).width > 220 && fs > 30) { fs -= 2; g.font = font(); }
    g.fillStyle = '#eef0f3';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 128, 134);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function gzLabelFaces() {
    gzMats.forEach((m, i) => {
      if (m.map) m.map.dispose();
      m.map = gzFaceTexture(i18n(`view.${GZ_FACES[i]}`));
      m.needsUpdate = true;
    });
    gzDirty = true;
  }

  function gzLetter(letter, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '700 46px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(10, 12, 16, .75)';
    g.strokeText(letter, 32, 30);
    g.fillStyle = color;
    g.fillText(letter, 32, 30);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // The file's own axes: STL / 3MF files are Z-up and were turned to Y-up on
  // load (file y now points to -Z), so the labels follow the file, not three.js.
  function gzBuildAxes() {
    gzUp = state.upAxis;
    gzAxes.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    gzAxes.clear();
    const zUp = gzUp === 'z';
    const defs = [
      { l: 'x', c: '#ff5c63', d: new THREE.Vector3(1, 0, 0) },
      { l: 'y', c: '#3ccb7f', d: zUp ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0) },
      { l: 'z', c: '#5b9dff', d: zUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1) },
    ];
    // all three run along cube edges from the corner they share
    const o = defs.reduce((v, a) => v.sub(a.d), new THREE.Vector3()).multiplyScalar(1.03);
    const up = new THREE.Vector3(0, 1, 0), len = 2.3;
    for (const a of defs) {
      const mat = new THREE.MeshBasicMaterial({ color: a.c });
      const turn = new THREE.Quaternion().setFromUnitVectors(up, a.d);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 8), mat);
      shaft.quaternion.copy(turn);
      shaft.position.copy(o).addScaledVector(a.d, len / 2);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 14), mat);
      head.quaternion.copy(turn);
      head.position.copy(o).addScaledVector(a.d, len + 0.15);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: gzLetter(a.l, a.c) }));
      tag.position.copy(o).addScaledVector(a.d, len + 0.62);
      tag.scale.setScalar(0.62);
      gzAxes.add(shaft, head, tag);
    }
    gzDirty = true;
  }

  function gzResize() {
    if (!gzRenderer) return;
    const w = gzCanvas.clientWidth, h = gzCanvas.clientHeight;
    if (!w || !h) return;
    gzRenderer.setSize(w, h, false);
    gzDirty = true;
  }
  new ResizeObserver(gzResize).observe(gzCanvas);
  // three.js re-creates its GL state after a context loss; draw the cube again then
  gzCanvas.addEventListener('webglcontextrestored', () => { gzDirty = true; });
  // Browser zoom or moving to a screen with another scale changes devicePixelRatio
  // without resizing anything, so watch for it and re-size both canvases.
  (function watchPixelRatio() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onChange = () => {
      mq.removeEventListener('change', onChange);
      const pr = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(pr);
      resize();
      if (gzRenderer) { gzRenderer.setPixelRatio(pr); gzResize(); }
      watchPixelRatio();
    };
    mq.addEventListener('change', onChange);
  })();

  function renderGizmo() {
    if (!gzRenderer || !gzCanvas.clientWidth) return;
    if (gzUp !== state.upAxis) gzBuildAxes();
    const turned = !gzLastQ.equals(camera.quaternion);
    if (!gzDirty && !turned) return;
    gzLastQ.copy(camera.quaternion);
    gzCam.quaternion.copy(camera.quaternion);
    gzCam.position.set(0, 0, 10).applyQuaternion(camera.quaternion);
    gzCam.updateMatrixWorld();
    // the cube turned under a resting pointer: highlight what it is over now
    if (turned && gzPointer && !gzDrag) gzSetHover(gzRegion(gzPointer));
    gzDirty = false;
    // shade each face by how much it turns toward a light fixed to the viewer
    const lw = gzLight.clone().applyQuaternion(camera.quaternion);
    gzMats.forEach((m, i) => m.color.setScalar(0.62 + 0.38 * Math.max(0, GZ_NORMALS[i].dot(lw))));
    gzRenderer.render(gzScene, gzCam);
  }

  // which face / edge / corner is under the pointer, as a -1/0/1 vector
  function gzRegion(e) {
    const rect = gzCanvas.getBoundingClientRect();
    gzNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    gzRay.setFromCamera(gzNdc, gzCam);
    const hit = gzRay.intersectObject(gzCube, false)[0];
    if (!hit) return null;
    const p = hit.point;
    return [p.x, p.y, p.z].map((v) => (Math.abs(v) > GZ_EDGE ? Math.sign(v) : 0));
  }
  function gzSetHover(r) {
    gzCanvas.style.cursor = r ? 'pointer' : 'grab';
    const key = r ? r.join() : '';
    if (key === (gzHover ? gzHover.join() : '')) return;
    gzHover = r;
    if (r) {
      const out = 1.025, mid = (GZ_EDGE + out) / 2;
      gzHl.position.set(...r.map((s) => s * mid));
      gzHl.scale.set(...r.map((s) => (s ? out - GZ_EDGE : 2 * GZ_EDGE)));
      gzHl.material.color.set(cssVar('--accent'));
    }
    gzHl.visible = !!r;
    gzDirty = true;
  }

  gzCanvas.addEventListener('pointerdown', (e) => {
    // one pointer drives the cube; a second finger must not take the drag over
    if (e.button !== 0 || !state.model || gzDrag) return;
    e.preventDefault();
    try { gzCanvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    gzDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  gzCanvas.addEventListener('pointermove', (e) => {
    gzPointer = { clientX: e.clientX, clientY: e.clientY };
    if (gzDrag && e.pointerId === gzDrag.id) {
      const dx = e.clientX - gzDrag.x, dy = e.clientY - gzDrag.y;
      if (!gzDrag.moved && Math.hypot(dx, dy) < 4) return;
      if (!gzDrag.moved) { gzDrag.moved = true; gzSetHover(null); gzCanvas.style.cursor = 'grabbing'; }
      gzDrag.x = e.clientX;
      gzDrag.y = e.clientY;
      orbitBy(-dx * 0.012, -dy * 0.012);
      return;
    }
    if (!gzDrag) gzSetHover(gzRegion(e));
  });
  gzCanvas.addEventListener('pointerup', (e) => {
    if (!gzDrag || e.pointerId !== gzDrag.id) return;
    const moved = gzDrag.moved;
    gzDrag = null;
    gzPointer = e.pointerType === 'mouse' ? { clientX: e.clientX, clientY: e.clientY } : null;
    const r = gzRegion(e);
    if (!moved && r) fitView(new THREE.Vector3(...r), true);
    gzSetHover(gzPointer ? r : null);
  });
  gzCanvas.addEventListener('pointercancel', (e) => {
    if (!gzDrag || e.pointerId !== gzDrag.id) return;
    gzDrag = null;
    gzPointer = null;
    gzSetHover(null);
  });
  gzCanvas.addEventListener('pointerleave', () => { if (!gzDrag) { gzPointer = null; gzSetHover(null); } });
  gzCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // the wheel over the cube still zooms the view
  gzCanvas.addEventListener('wheel', (e) => { e.preventDefault(); canvas.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
  $('fit-btn').addEventListener('click', () => fitView('fit', true));
  gzLabelFaces();
  // the face labels use the page font; redraw them once it has loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(gzLabelFaces).catch(() => {});

  // --------------------------------------------------------------- picking --
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const ndc = new THREE.Vector2();
  function pick(cx, cy) {
    if (!state.mesh) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(state.mesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    return { f: Math.floor(h.face.a / 3), point: h.point.clone(), dir: raycaster.ray.direction.clone() };
  }

  // squared distance from point p to triangle (a,b,c) — Ericson, RTCD 5.1.5
  function triDist2(px, py, pz, P, a, b, c) {
    const ax = P[a], ay = P[a + 1], az = P[a + 2];
    const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az;
    const acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let qx, qy, qz;
    if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
    else {
      const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2];
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2];
      const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d3 >= 0 && d4 <= d3) { qx = P[b]; qy = P[b + 1]; qz = P[b + 2]; }
      else if (d6 >= 0 && d5 <= d6) { qx = P[c]; qy = P[c + 1]; qz = P[c + 2]; }
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
      else if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        qx = P[b] + w * (P[c] - P[b]); qy = P[b + 1] + w * (P[c + 1] - P[b + 1]); qz = P[b + 2] + w * (P[c + 2] - P[b + 2]);
      } else {
        const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
        qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
      }
    }
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  // ------------------------------------------------------------ painting ----
  let stamp = new Int32Array(1), stampId = 0;
  let refN = new Float32Array(3);
  const queue = [];
  const SLIVER_Q = 0.1;

  // Flood over edge neighbours from f0, calling apply(f) on accepted faces.
  //  o.angle / o.limitAngle: max angle between neighbouring faces (sharp edge stop)
  //  o.cone: max angle to the clicked face's normal (keeps off smooth ridges); 180 = off
  //  o.accept(f): extra per-face test (brush radius, facing the camera)
  //  o.throughBlocked: the Block tool itself may walk over blocked faces
  // Sliver triangles have unreliable normals, so each face carries a reference
  // normal from the last well-shaped face on its path; slivers inherit it.
  function flood(f0, apply, o) {
    const m = state.model, N = m.fN, Q = m.fQ, adj = m.faceAdj, BL = state.blocked;
    const cosT = Math.cos(THREE.MathUtils.degToRad(o.angle));
    const useCone = o.cone !== undefined && o.cone < 180;
    const cosC = useCone ? Math.cos(THREE.MathUtils.degToRad(o.cone)) : -2;
    const sx = N[3 * f0], sy = N[3 * f0 + 1], sz = N[3 * f0 + 2];
    if (refN.length !== 3 * m.nF) refN = new Float32Array(3 * m.nF);
    if (!o.throughBlocked && BL[f0]) return;
    stampId++;
    queue.length = 0;
    queue.push(f0);
    stamp[f0] = stampId;
    refN[3 * f0] = sx; refN[3 * f0 + 1] = sy; refN[3 * f0 + 2] = sz;
    while (queue.length) {
      const f = queue.pop();
      if (f !== f0 && o.accept && !o.accept(f)) continue;
      apply(f);
      const rx = refN[3 * f], ry = refN[3 * f + 1], rz = refN[3 * f + 2];
      for (let k = 0; k < 3; k++) {
        const g = adj[3 * f + k];
        if (g < 0 || stamp[g] === stampId) continue;
        if (!o.throughBlocked && BL[g]) continue;
        const nx = N[3 * g], ny = N[3 * g + 1], nz = N[3 * g + 2];
        if (o.limitAngle && rx * nx + ry * ny + rz * nz < cosT) continue;
        if (useCone && sx * nx + sy * ny + sz * nz < cosC) continue;
        stamp[g] = stampId;
        if (Q[g] >= SLIVER_Q) { refN[3 * g] = nx; refN[3 * g + 1] = ny; refN[3 * g + 2] = nz; }
        else { refN[3 * g] = rx; refN[3 * g + 1] = ry; refN[3 * g + 2] = rz; }
        queue.push(g);
      }
    }
  }

  const coneDeg = () => (state.coneOn ? state.cone : 180);

  // Brush stroke stamp. block === null: paint group `value`; true/false: set/clear the mask.
  function brushAt(hit, value, block = null) {
    const m = state.model, P = m.pos, T = m.tri, N = m.fN;
    const r2 = state.brushR * state.brushR;
    const px = hit.point.x, py = hit.point.y, pz = hit.point.z;
    const dx = hit.dir.x, dy = hit.dir.y, dz = hit.dir.z;
    const front = state.frontOnly;
    flood(hit.f, block === null ? (f) => setFace(f, value) : (f) => setBlock(f, block), {
      angle: state.angle, limitAngle: state.stopSharp, cone: coneDeg(), throughBlocked: block !== null,
      accept: (f) => {
        if (front && N[3 * f] * dx + N[3 * f + 1] * dy + N[3 * f + 2] * dz >= 0) return false;
        return triDist2(px, py, pz, P, 3 * T[3 * f], 3 * T[3 * f + 1], 3 * T[3 * f + 2]) <= r2;
      },
    });
  }

  // eye: camera position; with "front only" the fill keeps to faces that look
  // toward it, so it cannot wrap over rounded edges onto side walls / the back.
  function bucketFill(f0, value, angleDeg = state.angle, eye = camera.position, cone = coneDeg()) {
    const m = state.model, N = m.fN, C = m.fC;
    const front = state.frontOnly && eye;
    const ex = front ? eye.x : 0, ey = front ? eye.y : 0, ez = front ? eye.z : 0;
    flood(f0, (f) => setFace(f, value), {
      angle: angleDeg, limitAngle: true, cone,
      accept: front ? (f) => {
        const dx = C[3 * f] - ex, dy = C[3 * f + 1] - ey, dz = C[3 * f + 2] - ez;
        const d = N[3 * f] * dx + N[3 * f + 1] * dy + N[3 * f + 2] * dz;
        return d < -0.26 * Math.hypot(dx, dy, dz); // tilted less than ~75° from the view ray
      } : null,
    });
  }

  function pushUndo() {
    autosaveDirty = true;
    if (showPieces) setShowPieces(false); // editing the paint: show group colours again
    state.undo.push({ g: state.faceGroup.slice(), b: state.blocked.slice(), s: state.seams.slice() });
    if (state.undo.length > 40) state.undo.shift();
    state.redo.length = 0;
    syncUndoButtons();
  }
  function restore(snap) {
    state.faceGroup.set(snap.g);
    state.blocked.set(snap.b);
    state.seams.set(snap.s);
    rebuildSeamLines();
    recolorAll(); updateCounts(); syncUndoButtons();
  }
  function undo() {
    if (!state.undo.length || !state.model) return;
    state.redo.push({ g: state.faceGroup.slice(), b: state.blocked.slice(), s: state.seams.slice() });
    restore(state.undo.pop());
  }
  function redo() {
    if (!state.redo.length || !state.model) return;
    state.undo.push({ g: state.faceGroup.slice(), b: state.blocked.slice(), s: state.seams.slice() });
    restore(state.redo.pop());
  }
  function syncUndoButtons() {
    $('undo').disabled = !state.undo.length;
    $('redo').disabled = !state.redo.length;
  }

  function growShrink(grow) {
    if (!state.model) return;
    const g = state.group, fg = state.faceGroup, adj = state.model.faceAdj;
    const list = [];
    for (let f = 0; f < fg.length; f++) {
      if (grow) {
        if (fg[f] !== 0 || state.blocked[f]) continue;
        for (let k = 0; k < 3; k++) { const n = adj[3 * f + k]; if (n >= 0 && fg[n] === g) { list.push(f); break; } }
      } else {
        if (fg[f] !== g) continue;
        for (let k = 0; k < 3; k++) { const n = adj[3 * f + k]; if (n >= 0 && fg[n] !== g) { list.push(f); break; } }
      }
    }
    if (!list.length) return;
    pushUndo();
    for (const f of list) setFace(f, grow ? g : 0);
    updateCounts();
  }

  function clearGroups(onlyActive) {
    if (!state.model) return;
    pushUndo();
    const fg = state.faceGroup;
    for (let f = 0; f < fg.length; f++) if (fg[f] && (!onlyActive || fg[f] === state.group)) setFace(f, 0);
    updateCounts();
  }

  // Reset the work on the current model: paint, blocks, cuts and the unwrap
  // result. Settings stay; the paint part can be undone with Ctrl+Z.
  function resetAll() {
    if (!state.model) return;
    pushUndo();
    state.faceGroup.fill(0);
    state.blocked.fill(0);
    state.seams.fill(0);
    endCut();
    rebuildSeamLines();
    state.pieces = null; state.layout = null; state.flatWarnings = [];
    clearPieceView();
    recolorAll();
    updateCounts();
    render2D();
    switchTab('3d');
    fitView('front');
    toast(i18n('msg.reset'));
  }

  function clearBlocks() {
    if (!state.model || !state.blocked.some((b) => b)) return;
    pushUndo();
    for (let f = 0; f < state.blocked.length; f++) if (state.blocked[f]) setBlock(f, false);
    updateCounts();
  }

  // ------------------------------------------------------------- cut tool ---
  // Cuts are mesh edges marked as seams (like Blender's Mark Seam). Clicked
  // points are joined by the shortest edge path; unwrap slits the decal there.
  let seamLines = null, previewLines = null;
  let cutLast = -1;            // vertex where the current cut chain ends (-1 = none)
  let vGraph = null, vNormals = null, previewAt = 0;

  function vertexGraph() {
    if (vGraph) return vGraph;
    const m = state.model, nV = m.nV, nE = m.nE;
    const ptr = new Int32Array(nV + 1);
    for (let e = 0; e < nE; e++) { ptr[m.edgeV[2 * e] + 1]++; ptr[m.edgeV[2 * e + 1] + 1]++; }
    for (let v = 0; v < nV; v++) ptr[v + 1] += ptr[v];
    const fillp = ptr.slice(0, nV), to = new Int32Array(2 * nE), ed = new Int32Array(2 * nE), w = new Float64Array(2 * nE);
    for (let e = 0; e < nE; e++) {
      const a = m.edgeV[2 * e], b = m.edgeV[2 * e + 1];
      const l = Math.hypot(m.pos[3 * a] - m.pos[3 * b], m.pos[3 * a + 1] - m.pos[3 * b + 1], m.pos[3 * a + 2] - m.pos[3 * b + 2]);
      let q = fillp[a]++; to[q] = b; ed[q] = e; w[q] = l;
      q = fillp[b]++; to[q] = a; ed[q] = e; w[q] = l;
    }
    vGraph = { ptr, to, ed, w };
    return vGraph;
  }

  function vertexNormals() {
    if (vNormals) return vNormals;
    const m = state.model, n = new Float32Array(3 * m.nV);
    for (let f = 0; f < m.nF; f++) for (let k = 0; k < 3; k++) {
      const v = m.tri[3 * f + k];
      n[3 * v] += m.fN[3 * f] * m.fA[f]; n[3 * v + 1] += m.fN[3 * f + 1] * m.fA[f]; n[3 * v + 2] += m.fN[3 * f + 2] * m.fA[f];
    }
    for (let v = 0; v < m.nV; v++) {
      const l = Math.hypot(n[3 * v], n[3 * v + 1], n[3 * v + 2]) || 1;
      n[3 * v] /= l; n[3 * v + 1] /= l; n[3 * v + 2] /= l;
    }
    vNormals = n;
    return n;
  }

  // edges touching at least one painted face (cuts only matter inside decals)
  function paintedEdges() {
    const m = state.model, fg = state.faceGroup, out = new Uint8Array(m.nE);
    for (let f = 0; f < m.nF; f++) {
      if (!fg[f]) continue;
      out[m.faceEdge[3 * f]] = out[m.faceEdge[3 * f + 1]] = out[m.faceEdge[3 * f + 2]] = 1;
    }
    return out;
  }

  // shortest edge path between two vertices (Dijkstra, early exit); returns edge ids.
  // With `allowed`, only those edges are walked.
  function shortestPath(src, dst, allowed = null) {
    if (src === dst) return [];
    const { ptr, to, ed, w } = vertexGraph();
    const nV = state.model.nV;
    const dist = new Float64Array(nV).fill(Infinity), prevE = new Int32Array(nV).fill(-1), prevV = new Int32Array(nV).fill(-1);
    const hv = [], hd = [];
    const push = (v, d) => {
      let i = hv.length; hv.push(v); hd.push(d);
      while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hv[i] = hv[p]; hd[i] = hd[p]; i = p; }
      hv[i] = v; hd[i] = d;
    };
    const pop = () => {
      const v = hv[0], lv = hv.pop(), ld = hd.pop();
      if (hv.length) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= hv.length) break;
          if (c + 1 < hv.length && hd[c + 1] < hd[c]) c++;
          if (hd[c] >= ld) break;
          hv[i] = hv[c]; hd[i] = hd[c]; i = c;
        }
        hv[i] = lv; hd[i] = ld;
      }
      return v;
    };
    dist[src] = 0; push(src, 0);
    while (hv.length) {
      const d = hd[0], v = pop();
      if (d > dist[v]) continue;
      if (v === dst) break;
      for (let q = ptr[v]; q < ptr[v + 1]; q++) {
        if (allowed && !allowed[ed[q]]) continue;
        const t = to[q], nd = d + w[q];
        if (nd < dist[t]) { dist[t] = nd; prevV[t] = v; prevE[t] = ed[q]; push(t, nd); }
      }
    }
    if (!isFinite(dist[dst])) return [];
    const out = [];
    for (let v = dst; v !== src && v >= 0; v = prevV[v]) out.push(prevE[v]);
    return out;
  }

  function edgeLinePositions(edges) {
    const m = state.model, N = vertexNormals(), lift = m.bbox.diag * 0.0006;
    const arr = new Float32Array(edges.length * 6);
    edges.forEach((e, i) => {
      for (let s = 0; s < 2; s++) {
        const v = m.edgeV[2 * e + s];
        arr[6 * i + 3 * s] = m.pos[3 * v] + N[3 * v] * lift;
        arr[6 * i + 3 * s + 1] = m.pos[3 * v + 1] + N[3 * v + 1] * lift;
        arr[6 * i + 3 * s + 2] = m.pos[3 * v + 2] + N[3 * v + 2] * lift;
      }
    });
    return arr;
  }

  function setLines(current, edges, mat) {
    if (current) { scene.remove(current); current.geometry.dispose(); }
    if (!edges.length) return null;
    const g = new LineSegmentsGeometry();
    g.setPositions(edgeLinePositions(edges));
    const l = new LineSegments2(g, mat);
    l.renderOrder = 998;
    scene.add(l);
    return l;
  }

  function rebuildSeamLines() {
    const s = state.seams, edges = [];
    if (s) for (let e = 0; e < s.length; e++) if (s[e]) edges.push(e);
    seamLines = setLines(seamLines, state.model ? edges : [], seamMat);
    const info = $('cut-info');
    info.textContent = edges.length ? i18n('cuts.count', { n: fmtInt(edges.length) }) : i18n('cuts.none');
    $('clear-cuts').disabled = !edges.length;
    scheduleAutosave();
  }

  function showPreview(edges) { previewLines = setLines(previewLines, edges, previewMat); }

  function nearestVertex(hit) {
    const m = state.model;
    let best = -1, bd = Infinity;
    for (let k = 0; k < 3; k++) {
      const v = m.tri[3 * hit.f + k];
      const d = (m.pos[3 * v] - hit.point.x) ** 2 + (m.pos[3 * v + 1] - hit.point.y) ** 2 + (m.pos[3 * v + 2] - hit.point.z) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // Vertex a cut click snaps to: on a painted face, its nearest corner; otherwise
  // the nearest vertex of the painted surface within a few mm (raised bosses or
  // separate shells in front of the decal area are skipped).
  function cutVertex(hit) {
    const m = state.model, fg = state.faceGroup;
    if (fg[hit.f] || !fg.some((g) => g)) return nearestVertex(hit);
    const R = Math.max(3, state.brushR), R2 = R * R;
    const hx = hit.point.x, hy = hit.point.y, hz = hit.point.z;
    let best = -1, bd = R2;
    for (let f = 0; f < m.nF; f++) {
      if (!fg[f]) continue;
      for (let k = 0; k < 3; k++) {
        const v = m.tri[3 * f + k];
        const d = (m.pos[3 * v] - hx) ** 2 + (m.pos[3 * v + 1] - hy) ** 2 + (m.pos[3 * v + 2] - hz) ** 2;
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best >= 0 ? best : nearestVertex(hit);
  }

  function cutPath(a, b) {
    const allowed = state.faceGroup.some((g) => g) ? paintedEdges() : null;
    let path = shortestPath(a, b, allowed);
    if (!path.length && allowed) path = shortestPath(a, b, null);
    return path;
  }

  function endCut() { cutLast = -1; showPreview([]); updateHud(); }

  function cutClick(hit, remove) {
    const m = state.model;
    if (remove) {
      const r = Math.max(state.brushR, m.bbox.diag / 150), r2 = r * r;
      const P = m.pos, hx = hit.point.x, hy = hit.point.y, hz = hit.point.z;
      const hits = [];
      for (let e = 0; e < m.nE; e++) {
        if (!state.seams[e]) continue;
        const a = 3 * m.edgeV[2 * e], b = 3 * m.edgeV[2 * e + 1];
        const mx = (P[a] + P[b]) / 2 - hx, my = (P[a + 1] + P[b + 1]) / 2 - hy, mz = (P[a + 2] + P[b + 2]) / 2 - hz;
        if (mx * mx + my * my + mz * mz <= r2) hits.push(e);
      }
      if (hits.length) { pushUndo(); for (const e of hits) state.seams[e] = 0; rebuildSeamLines(); }
      endCut();
      return;
    }
    const v = cutVertex(hit);
    if (cutLast >= 0 && v !== cutLast) {
      const path = cutPath(cutLast, v);
      if (path.length) { pushUndo(); for (const e of path) state.seams[e] = 1; rebuildSeamLines(); }
      else toast(i18n('msg.cutSeparate'), 'bad');
    }
    cutLast = v;
    showPreview([]);
    updateHud();
  }

  function cutHover(hit) {
    if (cutLast < 0 || !hit) { if (previewLines) showPreview([]); return; }
    const now = performance.now();
    if (now - previewAt < 40) return;
    previewAt = now;
    showPreview(cutPath(cutLast, cutVertex(hit)));
  }

  // ------------------------------------------------------------ pointer -----
  let painting = false, strokeValue = 0, lastX = 0, lastY = 0, spaceDown = false;
  const touches = new Set();

  function paintTool() { return state.tool !== 'orbit' && !spaceDown; }

  function applyControlMode() {
    const orbitLeft = !paintTool() && !measuring;
    controls.mouseButtons = orbitLeft
      ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = orbitLeft
      ? { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
      : { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
    canvas.style.cursor = orbitLeft ? 'grab' : (measuring || state.tool !== 'fill' ? 'crosshair' : 'cell');
    updateHud();
  }

  function updateCursor(hit) {
    if (measuring) { ring.visible = false; dot.visible = false; return; }
    const pointTool = state.tool === 'fill' || state.tool === 'cut';
    const showRing = hit && paintTool() && !pointTool;
    ring.visible = !!showRing;
    dot.visible = !!(hit && paintTool() && pointTool);
    if (!hit) return;
    const N = state.model.fN, f = hit.f;
    const n = new THREE.Vector3(N[3 * f], N[3 * f + 1], N[3 * f + 2]);
    if (n.dot(hit.dir) > 0) n.negate();
    const obj = showRing ? ring : dot;
    const s = showRing ? state.brushR : state.model.bbox.diag / 250;
    obj.position.copy(hit.point).addScaledVector(n, s * 0.02);
    obj.lookAt(hit.point.clone().add(n));
    obj.scale.setScalar(s);
    const erasing = state.tool === 'erase' || shiftDown;
    if (state.tool === 'cut') { obj.material.color.set(shiftDown ? '#ffffff' : '#ff3b30'); return; }
    obj.material.color.set(state.tool === 'block' ? (shiftDown ? '#ffffff' : '#2b2f36') : erasing ? '#ffffff' : GROUP_COLORS[state.group]);
  }

  let shiftDown = false, strokeBlock = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (measuring && state.model && !spaceDown && (e.pointerType !== 'mouse' || e.button === 0)) { measureClick(e); return; }
    if (e.pointerType === 'touch') {
      touches.add(e.pointerId);
      if (touches.size > 1) { painting = false; return; }
    }
    if (!state.model || state.generating || !paintTool()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    shiftDown = e.shiftKey;
    const hit = pick(e.clientX, e.clientY);
    if (state.tool === 'cut') { if (hit) cutClick(hit, e.shiftKey); return; }
    if (state.tool === 'fill') {
      if (hit) {
        pushUndo();
        bucketFill(hit.f, e.shiftKey ? 0 : state.group);
        updateCounts();
      }
      return;
    }
    painting = true;
    strokeValue = (state.tool === 'erase' || e.shiftKey) ? 0 : state.group;
    strokeBlock = state.tool === 'block' ? !e.shiftKey : null;
    pushUndo();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    lastX = e.clientX; lastY = e.clientY;
    if (hit) brushAt(hit, strokeValue, strokeBlock);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.model) return;
    shiftDown = e.shiftKey;
    if (painting && touches.size <= 1) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
      for (let i = 1; i <= steps; i++) {
        const h = pick(lastX + (dx * i) / steps, lastY + (dy * i) / steps);
        if (h) brushAt(h, strokeValue, strokeBlock);
      }
      lastX = e.clientX; lastY = e.clientY;
    }
    if (e.pointerType !== 'touch') {
      const h = pick(e.clientX, e.clientY);
      updateCursor(h);
      if (state.tool === 'cut' && paintTool()) cutHover(h);
    }
  });
  const endStroke = (e) => {
    if (e && e.pointerType === 'touch') touches.delete(e.pointerId);
    if (painting) { painting = false; updateCounts(); }
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => { ring.visible = false; dot.visible = false; });
  canvas.addEventListener('dblclick', () => { if (state.tool === 'cut') endCut(); });

  // ------------------------------------------------------------- UI: 3D ----
  function syncBrushLabel() { $('brush-val').textContent = `${state.brushR.toFixed(state.brushR < 10 ? 1 : 0)} mm`; updateHud(); }

  function updateHud() {
    const hud = $('hud');
    if (!state.model) { hud.textContent = ''; hud.hidden = true; return; }
    hud.hidden = false;
    const parts = [spaceDown ? i18n('hud.orbitSpace') : i18n(`tool.${state.tool}`)];
    if (state.tool === 'cut') parts.push(i18n(cutLast >= 0 ? 'hud.cutNext' : 'hud.cutStart'));
    else if (state.tool === 'block') parts.push(i18n('hud.block'));
    else if (state.tool !== 'orbit') parts.push(state.tool === 'erase' ? i18n('hud.erase') : i18n('hud.group', { g: state.group }));
    if (state.tool === 'brush' || state.tool === 'erase' || state.tool === 'block') parts.push(`r = ${state.brushR.toFixed(1)} mm`);
    parts.push(i18n(state.tool === 'orbit' ? 'hud.orbitMouse' : 'hud.paintMouse'));
    hud.textContent = parts.join('  ·  ');
  }

  function setTool(t) {
    if (state.tool === 'cut' && t !== 'cut' && state.model) endCut();
    state.tool = t;
    document.querySelectorAll('#tools .seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    applyControlMode();
  }

  // 950 · 1.2k · 34k · 1.5M: fits the narrow group tiles
  function fmtShort(n) {
    if (n < 1000) return String(n);
    if (n < 1e4) return `${(n / 1000).toFixed(1)}k`;
    if (n < 1e6) return `${Math.round(n / 1000)}k`;
    return `${(n / 1e6).toFixed(1)}M`;
  }

  function renderChips(counts) {
    const el = $('group-chips');
    el.innerHTML = '';
    for (let g = 1; g <= 8; g++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.id = `group-${g}`;
      b.setAttribute('aria-pressed', String(g === state.group));
      b.setAttribute('aria-label', i18n('chip.aria', { g, n: fmtInt(counts[g]) }));
      b.style.setProperty('--c', GROUP_COLORS[g]);
      b.title = i18n('chip.aria', { g, n: fmtInt(counts[g]) });
      b.innerHTML = `<span class="dot">${g}</span><span class="chip-c">${counts[g] ? fmtShort(counts[g]) : '–'}</span>`;
      b.addEventListener('click', () => { state.group = g; updateCounts(); updateHud(); if (state.tool === 'erase' || state.tool === 'orbit' || state.tool === 'block') setTool('brush'); });
      el.appendChild(b);
    }
  }

  function updateCounts() {
    const counts = new Array(9).fill(0);
    if (state.faceGroup) for (let f = 0; f < state.faceGroup.length; f++) counts[state.faceGroup[f]]++;
    renderChips(counts);
    let painted = 0;
    for (let g = 1; g <= 8; g++) painted += counts[g];
    $('generate').disabled = !painted || state.generating;
    let nb = 0;
    if (state.blocked) for (let f = 0; f < state.blocked.length; f++) nb += state.blocked[f];
    $('block-info').textContent = nb ? i18n('blocked.count', { n: fmtInt(nb) }) : i18n('blocked.none');
    $('clear-block').disabled = !nb;
    syncUndoButtons();
    scheduleAutosave();
  }

  $('file-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; openFile(f); });
  $('demo-panel').addEventListener('click', () => loadDemo('panel'));
  $('demo-cyl').addEventListener('click', () => loadDemo('cyl'));
  $('unit').addEventListener('change', () => {
    state.unitScale = Number($('unit').value) || 1;
    if (state.raw) rebuildModel(true), fitView('fit');
  });
  $('up-axis').addEventListener('change', () => {
    state.upAxis = $('up-axis').value;
    if (state.raw) rebuildModel(true), fitView('front');
  });
  document.querySelectorAll('#tools .seg-btn').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('brush-size').addEventListener('input', (e) => { state.brushR = Number(e.target.value); syncBrushLabel(); });
  $('angle').addEventListener('input', (e) => { state.angle = Number(e.target.value); $('angle-val').textContent = `${state.angle}°`; });
  $('stop-sharp').addEventListener('change', (e) => { state.stopSharp = e.target.checked; });
  $('front-only').addEventListener('change', (e) => { state.frontOnly = e.target.checked; });
  $('cone-on').addEventListener('change', (e) => { state.coneOn = e.target.checked; $('cone-field').hidden = !state.coneOn; });
  $('cone').addEventListener('input', (e) => { state.cone = Number(e.target.value); $('cone-val').textContent = `${state.cone}°`; });
  $('clear-block').addEventListener('click', clearBlocks);
  $('clear-cuts').addEventListener('click', () => { if (!state.seams || !state.seams.some((x) => x)) return; pushUndo(); state.seams.fill(0); endCut(); rebuildSeamLines(); });
  $('islands').addEventListener('change', (e) => { $('island-field').hidden = !e.target.checked; });
  $('island-tol').addEventListener('input', (e) => { $('island-val').textContent = `${Number(e.target.value).toFixed(1)}%`; });
  $('show-pieces').addEventListener('click', () => setShowPieces(!showPieces));
  $('grow').addEventListener('click', () => growShrink(true));
  $('shrink').addEventListener('click', () => growShrink(false));
  $('clear-group').addEventListener('click', () => clearGroups(true));
  $('clear-all').addEventListener('click', () => clearGroups(false));
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('reset-all').addEventListener('click', resetAll);
  document.querySelectorAll('#viewbar button[data-view]').forEach((b) => b.addEventListener('click', () => fitView(b.dataset.view, true)));

  // drag & drop anywhere on the 3D stage
  const v3 = $('view-3d');
  let dragDepth = 0;
  v3.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('drop-veil').hidden = false; });
  v3.addEventListener('dragover', (e) => { e.preventDefault(); });
  v3.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop-veil').hidden = true; });
  v3.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('drop-veil').hidden = true;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  const dz = $('drop-zone');
  dz.addEventListener('dragover', (e) => e.preventDefault());
  dz.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

  // keyboard
  const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftDown = true;
    if (typing(e.target)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (currentTab !== '3d') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!spaceDown) { spaceDown = true; painting = false; applyControlMode(); }
      return;
    }
    if (k === 'b') setTool('brush');
    else if (k === 'f') setTool('fill');
    else if (k === 'e') setTool('erase');
    else if (k === 'v') setTool('orbit');
    else if (k === 'x') setTool('block');
    else if (k === 'c') setTool('cut');
    else if ((k === 'enter' || k === 'escape') && state.tool === 'cut') endCut();
    else if (k === '[' || k === ']') {
      const bs = $('brush-size');
      const r = Math.min(Number(bs.max), Math.max(Number(bs.min), state.brushR * (k === ']' ? 1.18 : 1 / 1.18)));
      state.brushR = +r.toPrecision(3); bs.value = String(state.brushR); syncBrushLabel();
    } else if (/^[1-8]$/.test(k)) { state.group = Number(k); updateCounts(); updateHud(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftDown = false;
    if (e.code === 'Space' && spaceDown) { spaceDown = false; applyControlMode(); }
  });
  window.addEventListener('blur', () => { if (spaceDown) { spaceDown = false; applyControlMode(); } shiftDown = false; });

  // ------------------------------------------------------------- generate ---
  async function generate() {
    if (!state.model || state.generating) return;
    state.generating = true; state.cancel = false;
    $('generate').disabled = true;
    $('progress').hidden = false;
    $('progress-bar').style.width = '0%';
    $('progress-text').textContent = i18n('progress.preparing');
    camera.updateMatrixWorld();
    try {
      const res = await Flat.generate(
        state.model, state.faceGroup,
        {
          quality: $('quality').value, autoSeam: $('auto-seam').checked, viewMatrix: camera.matrixWorldInverse.elements.slice(),
          islands: $('islands').checked, islandTolerance: Number($('island-tol').value) / 100, seams: state.seams, lang,
        },
        (text, frac) => { $('progress-text').textContent = text; $('progress-bar').style.width = `${Math.round(Math.min(1, frac) * 100)}%`; },
        () => state.cancel,
      );
      state.pieces = res.pieces;
      state.flatWarnings = res.warnings;
      artSel = null;
      if (res.pieces.length) { buildPieceView(); $('show-pieces').hidden = false; setShowPieces(true); }
      if (!res.pieces.length) { toast(res.warnings[0] || i18n('msg.noPieces'), 'bad'); return; }
      relayout();
      switchTab('2d');
      toast(res.pieces.length === 1 ? i18n('msg.unwrapped1') : i18n('msg.unwrapped', { n: res.pieces.length }));
    } catch (e) {
      if (e && e.message === 'cancelled') toast(i18n('msg.cancelled'));
      else { console.error(e); toast(i18n('msg.unwrapFail', { e: e && e.message ? e.message : e }), 'bad'); }
    } finally {
      state.generating = false;
      $('progress').hidden = true;
      updateCounts();
    }
  }
  $('generate').addEventListener('click', generate);
  $('cancel').addEventListener('click', () => { state.cancel = true; });

  // ------------------------------------------------------------------ tabs ---
  let currentTab = '3d';
  function switchTab(t) {
    currentTab = t;
    $('tab-3d').setAttribute('aria-selected', String(t === '3d'));
    $('tab-2d').setAttribute('aria-selected', String(t === '2d'));
    $('view-3d').hidden = t !== '3d';
    $('view-2d').hidden = t !== '2d';
    $('panel-3d').hidden = t !== '3d';
    $('panel-2d').hidden = t !== '2d';
    if (t === '3d') requestAnimationFrame(resize);
    $('side').scrollTop = 0;
  }
  $('tab-3d').addEventListener('click', () => switchTab('3d'));
  $('tab-2d').addEventListener('click', () => switchTab('2d'));

  // -------------------------------------------------------------------- 2D ---
  function baseName() {
    return (state.rawName || 'decal').replace(/\.[^.]+$/, '').replace(/[^\w\-.]+/g, '-').replace(/^-+|-+$/g, '') || 'decal';
  }

  function relayout() {
    if (!state.pieces || !state.pieces.length) { state.layout = null; render2D(); return; }
    settings.fileName = state.rawName;
    settings.artwork = artworkStore;
    try {
      state.layout = Layout.build(state.pieces, settings);
      if (pieceOf) buildSeamTags();
    } catch (e) {
      console.error(e);
      toast(i18n('msg.layoutFail', { e: e.message }), 'bad');
      state.layout = null;
    }
    render2D();
  }

  function pill(d) {
    if (d <= 0.01) return `<span class="pill good">${i18n('pill.good')}</span>`;
    if (d <= 0.03) return `<span class="pill warn">${i18n('pill.ok')}</span>`;
    return `<span class="pill bad">${i18n('pill.bad')}</span>`;
  }

  function render2D() {
    const L = state.layout;
    const pagesEl = $('pages');
    $('empty-2d').hidden = !!(L && L.pages.length);
    $('tab-2d-badge').hidden = !(L && L.pages.length);
    $('view-2d').style.setProperty('--mm', `${zoom}px`);
    if (!L) { pagesEl.innerHTML = ''; $('piece-list').innerHTML = ''; $('warn-list').innerHTML = ''; return; }
    $('tab-2d-badge').textContent = String(L.pages.length);
    const W = L.pageW, H = L.pageH;
    const paperName = settings.paper === 'custom' ? `${W.toFixed(0)}×${H.toFixed(0)} mm` : settings.paper;
    const ori = i18n(L.orientation === 'landscape' ? 'orient.landscape' : 'orient.portrait');
    pagesEl.innerHTML = L.pages.map((p, i) => `<figure class="sheet-wrap"><figcaption>${i18n('page.caption', { i: i + 1, n: L.pages.length, paper: paperName, orient: ori })}</figcaption><div class="sheet" style="width:${(W * zoom).toFixed(1)}px;height:${(H * zoom).toFixed(1)}px">${Layout.toSVG(L, i, { preview: true })}</div></figure>`).join('');
    const byId = new Map(state.pieces.map((p) => [p.id, p]));
    $('piece-list').innerHTML = L.pieceInfo.map((inf) => {
      const p = byId.get(inf.parentId !== undefined ? inf.parentId : inf.id);
      const st = p.stats;
      const extra = [];
      if (st.seams) extra.push(st.seams === 1 ? i18n('piece.seams1') : i18n('piece.seams', { n: st.seams }));
      if (inf.parts > 1) extra.push(i18n('piece.part', { k: inf.part, n: inf.parts }));
      if (inf.tiled) extra.push(i18n('piece.tiled', { n: inf.tiles }));
      if (inf.rotated90) extra.push(i18n('piece.rotated'));
      if (inf.pages.length && !inf.tiled) extra.push(i18n('piece.page', { p: inf.pages.map((x) => x + 1).join(', ') }));
      return `<li class="piece" style="--c:${GROUP_COLORS[inf.group]}"><span class="dot"></span><span class="piece-title">${i18n('piece.title', { id: inf.id, g: inf.group })}</span>${pill(st.maxDistortion)}
        <span class="piece-meta"><span class="mono">${inf.w.toFixed(1)} × ${inf.h.toFixed(1)} mm</span><span>${i18n('piece.avg')} <span class="mono">${(st.meanDistortion * 100).toFixed(2)}%</span> · ${i18n('piece.max')} <span class="mono">${(st.maxDistortion * 100).toFixed(1)}%</span></span>${extra.length ? `<span>${extra.join(' · ')}</span>` : ''}</span></li>`;
    }).join('');
    const warns = [...(state.flatWarnings || []), ...L.warnings];
    $('warn-list').innerHTML = warns.map((w) => `<li>${w.replace(/</g, '&lt;')}</li>`).join('');
    syncArtUI();
  }

  let relayoutTimer = 0;
  const scheduleRelayout = () => { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(relayout, 120); };

  const bindings = [
    ['paper', 'paper', (v) => v],
    ['orientation', 'orientation', (v) => v],
    ['custom-w', 'customW', Number],
    ['custom-h', 'customH', Number],
    ['margin', 'margin', Number],
    ['gap', 'gap', Number],
    ['overlap', 'overlap', Number],
    ['rotate-mode', 'rotateMode', (v) => v],
    ['offset', 'offset', (v) => Math.max(-5, Math.min(5, Number(v) || 0))],
    ['line-width', 'lineWidth', Number],
    ['fill-color', 'fillColor', (v) => v],
    ['fold-angle', 'foldAngle', Number],
    ['bleed', 'bleed', (v) => Math.max(0, Math.min(5, Number(v) || 0))],
    ['tab-width', 'tabWidth', (v) => Math.max(2, Math.min(15, Number(v) || 5))],
  ];
  for (const [id, keyName, parse] of bindings) {
    $(id).addEventListener('input', (e) => {
      settings[keyName] = parse(e.target.value);
      if (id === 'paper') $('custom-size').hidden = settings.paper !== 'custom';
      if (id === 'line-width') $('lw-val').textContent = `${settings.lineWidth.toFixed(2)} mm`;
      if (id === 'fold-angle') $('fold-val').textContent = `${settings.foldAngle}°`;
      if (id === 'offset') $('offset-val').textContent = settings.offset.toFixed(1);
      scheduleRelayout();
    });
  }
  for (const [id, keyName] of [['mirror', 'mirror'], ['split-long', 'splitLong'], ['clean', 'clean'], ['fill', 'fill'], ['folds', 'folds'], ['labels', 'labels'], ['calibration', 'calibration'], ['heatmap', 'heatmap'], ['seam-marks', 'seamMarks'], ['tabs', 'tabs']]) {
    $(id).addEventListener('change', (e) => {
      settings[keyName] = e.target.checked;
      if (id === 'heatmap') $('heat-legend').hidden = !settings.heatmap;
      scheduleRelayout();
    });
  }
  $('zoom').addEventListener('input', (e) => {
    zoom = Number(e.target.value);
    $('zoom-val').textContent = `${zoom.toFixed(1)} px/mm`;
    render2D();
  });

  // ------------------------------------------------------------ artwork ----
  // Images placed on pieces. A placement lives in the piece's flat (UV) space,
  // so it follows the piece through rotation, mirroring, nesting and split parts.
  let artSel = null;
  const artOf = (id) => (id !== null && id !== undefined ? artworkStore[id] : null);

  // UV bounding box of a flatten piece
  function pieceBox(id) {
    const p = state.pieces && state.pieces.find((q) => String(q.id) === String(id));
    if (!p) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const L of p.loops) for (const v of L) {
      const u = p.uv[2 * v], w = p.uv[2 * v + 1];
      if (u < x0) x0 = u; if (u > x1) x1 = u; if (w < y0) y0 = w; if (w > y1) y1 = w;
    }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }
  // size the image to fit inside (cover = false) or cover (true) the piece
  function placeArt(art, id, cover) {
    const b = pieceBox(id);
    if (!b) return;
    const r = ((art.r || 0) * Math.PI) / 180, ar = art.ih / art.iw;
    // box of the rotated image per mm of width
    const bw = Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)) * ar, bh = Math.abs(Math.sin(r)) + Math.abs(Math.cos(r)) * ar;
    const s = cover ? Math.max(b.w / bw, b.h / bh) : Math.min(b.w / bw, b.h / bh);
    art.x = b.cx; art.y = b.cy; art.s = +Math.max(1, s * (cover ? 1.02 : 0.96)).toFixed(1);
  }

  function syncArtUI() {
    const art = artOf(artSel);
    $('art-target').textContent = artSel === null ? i18n('art.pick') : i18n('art.selected', { id: artSel });
    $('art-add').classList.toggle('disabled', artSel === null);
    for (const id of ['art-fit', 'art-fill', 'art-remove', 'art-size', 'art-rot', 'art-op', 'art-tile', 'art-all']) $(id).disabled = !art;
    if (art) {
      $('art-size').value = String(art.s);
      $('art-rot').value = String(art.r || 0);
      $('art-op').value = String(Math.round((art.op === undefined ? 1 : art.op) * 100));
      $('art-tile').checked = !!art.tile;
    }
    document.querySelectorAll('#pages path[data-piece]').forEach((el) => el.classList.toggle('sel', artSel !== null && el.dataset.piece === String(artSel)));
  }

  // read an image file, scaled down to at most 2048 px on its longest side
  function loadArtFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('read'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image'));
        img.onload = () => {
          let w = img.naturalWidth || 1024, hgt = img.naturalHeight || 1024;
          const k = Math.min(1, 2048 / Math.max(w, hgt));
          w = Math.max(1, Math.round(w * k)); hgt = Math.max(1, Math.round(hgt * k));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = hgt;
          cv.getContext('2d').drawImage(img, 0, 0, w, hgt);
          const jpeg = /jpe?g$/i.test(file.type);
          resolve({ img: cv.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9), iw: w, ih: hgt });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  async function applyArtFile(f) {
    if (!f || artSel === null) return;
    try {
      const im = await loadArtFile(f);
      const art = { ...im, r: 0, op: 1, tile: false };
      placeArt(art, artSel, true);
      artworkStore[artSel] = art;
      relayout();
    } catch (err) { toast(i18n('msg.artBad'), 'bad'); }
  }
  $('art-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; applyArtFile(f); });
  // drop an image on a piece of the sheet: select it and use the image
  $('pages').addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  $('pages').addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !/^image\//.test(f.type)) return;
    e.preventDefault();
    const el = (document.elementFromPoint(e.clientX, e.clientY) || e.target).closest('path[data-piece]');
    if (el) { artSel = el.dataset.piece; syncArtUI(); }
    if (artSel === null) { toast(i18n('art.pick')); return; }
    applyArtFile(f);
  });
  $('art-add').addEventListener('click', (e) => { if (artSel === null) { e.preventDefault(); toast(i18n('art.pick')); } });
  $('art-fit').addEventListener('click', () => { const a = artOf(artSel); if (a) { placeArt(a, artSel, false); relayout(); } });
  $('art-fill').addEventListener('click', () => { const a = artOf(artSel); if (a) { placeArt(a, artSel, true); relayout(); } });
  $('art-remove').addEventListener('click', () => { if (artOf(artSel)) { delete artworkStore[artSel]; relayout(); } });
  for (const [id, key, parse] of [['art-size', 's', (v) => Math.max(1, Number(v) || 1)], ['art-rot', 'r', (v) => Number(v) || 0], ['art-op', 'op', (v) => Math.max(0.05, Math.min(1, (Number(v) || 100) / 100))]]) {
    $(id).addEventListener('input', (e) => { const a = artOf(artSel); if (a) { a[key] = parse(e.target.value); scheduleRelayout(); } });
  }
  $('art-tile').addEventListener('change', (e) => { const a = artOf(artSel); if (a) { a.tile = e.target.checked; relayout(); } });
  $('art-all').addEventListener('click', () => {
    const a = artOf(artSel);
    if (!a || !state.pieces) return;
    for (const p of state.pieces) {
      if (String(p.id) === String(artSel)) continue;
      const copy = { ...a };
      if (!a.tile) placeArt(copy, p.id, true);
      artworkStore[p.id] = copy;
    }
    relayout();
  });

  // ---- built-in textures: photos made into seamless tiles (src/assets), shipped inside the page ----
  // filled in by build.mjs: { name: data URL }
  const TEXTURE_TILES = '%TEXTURES%';
  // tile width in mm for each kind (the photos are 512 px squares; carbon is 156 px)
  const TEXTURE_MM = { carbon: 22, leather: 60, metal: 100, wood: 140 };
  function texture(kind) {
    const img = TEXTURE_TILES[kind];
    const base = kind.replace(/\d+$/, '');
    const px = kind === 'carbon' ? 156 : 512;
    return { img, iw: px, ih: px, s: TEXTURE_MM[base] || 60 };
  }
  $('art-texture').addEventListener('change', (e) => {
    const kind = e.target.value;
    e.target.value = '';
    if (!kind) return;
    if (artSel === null) { toast(i18n('art.pick')); return; }
    const t = texture(kind);
    const b = pieceBox(artSel);
    artworkStore[artSel] = { img: t.img, iw: t.iw, ih: t.ih, s: t.s, x: b ? b.cx : 0, y: b ? b.cy : 0, r: 0, op: 1, tile: true, tex: kind };
    relayout();
  });

  // click a piece to select it; drag its artwork to move it
  let artDrag = null;
  $('pages').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('path[data-piece]');
    if (!el) { if (e.target.closest('.sheet')) { artSel = null; syncArtUI(); } return; }
    artSel = el.dataset.piece;
    syncArtUI();
    const art = artOf(artSel);
    const inf = state.layout && state.layout.pieceInfo.find((i) => String(i.id) === el.dataset.item);
    if (!art || !inf || !inf.frame) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    artDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: art.x, y0: art.y, fr: inf.frame, art };
  });
  let dragFrame = 0;
  $('pages').addEventListener('pointermove', (e) => {
    if (!artDrag || e.pointerId !== artDrag.id) return;
    // screen px -> page mm -> piece UV (inverse of the frame's linear part)
    const dX = (e.clientX - artDrag.x) / zoom, dY = (e.clientY - artDrag.y) / zoom;
    const { a, b, c, d } = artDrag.fr, det = a * d - b * c || 1;
    artDrag.art.x = artDrag.x0 + (d * dX - c * dY) / det;
    artDrag.art.y = artDrag.y0 + (-b * dX + a * dY) / det;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; relayout(); });
  });
  const endArtDrag = (e) => { if (artDrag && e.pointerId === artDrag.id) artDrag = null; };
  $('pages').addEventListener('pointerup', endArtDrag);
  $('pages').addEventListener('pointercancel', endArtDrag);

  // ------------------------------------------------------------ exports ----
  async function saveFile(filename, blob) {
    if (inArtifact) {
      let dl = null;
      try { dl = await window.claude.use('downloads'); } catch (e) { dl = null; }
      if (!dl) { toast(i18n('msg.dlBlocked'), 'bad'); return; }
      try {
        await dl.save({ filename, data: blob });
        toast(i18n('msg.saved', { f: filename }));
      } catch (e) {
        if (e && e.code === 'declined') return;
        toast(i18n('msg.saveFail', { e: (e && (e.code || e.message)) || 'error' }), 'bad');
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast(i18n('msg.downloaded', { f: filename }));
  }

  const needLayout = () => {
    if (!state.layout || !state.layout.pages.length) { toast(i18n('msg.nothingPrint'), 'bad'); return false; }
    return true;
  };
  const paperTag = () => (settings.paper === 'custom' ? 'custom' : settings.paper);

  $('btn-print').addEventListener('click', () => { if (needLayout()) Layout.printPages(state.layout); });
  $('btn-pdf').addEventListener('click', async () => {
    if (!needLayout()) return;
    try { await saveFile(`${baseName()}-decal-${paperTag()}.pdf`, await Layout.toPDF(state.layout)); }
    catch (e) { console.error(e); toast(e.message || i18n('msg.pdfFail'), 'bad'); }
  });
  $('btn-svg').addEventListener('click', async () => {
    if (!needLayout()) return;
    await saveFile(`${baseName()}-decal-cat.svg`, new Blob([Layout.toCutSVG(state.pieces, settings)], { type: 'image/svg+xml' }));
  });
  $('btn-dxf').addEventListener('click', async () => {
    if (!needLayout()) return;
    await saveFile(`${baseName()}-decal.dxf`, new Blob([Layout.toDXF(state.pieces, settings)], { type: 'application/dxf' }));
  });
  if (inArtifact) {
    $('btn-print').hidden = true;
    $('btn-dxf').hidden = true;
    $('artifact-note').hidden = false;
  }

  // -------------------------------------------------------------- project ---
  // A .decal file holds the model, the painting, print settings, the unwrap
  // options, the camera and placed artwork. Pieces are not stored: press
  // Unwrap again after opening.
  const PROJECT_SETTINGS = ['paper', 'customW', 'customH', 'orientation', 'margin', 'gap', 'overlap', 'rotateMode', 'mirror', 'offset',
    'lineWidth', 'fill', 'fillColor', 'folds', 'foldAngle', 'labels', 'clean', 'calibration', 'splitLong', 'seamMarks', 'bleed', 'tabs', 'tabWidth'];
  const CHECKBOX_SETTINGS = [['mirror', 'mirror'], ['split-long', 'splitLong'], ['clean', 'clean'], ['fill', 'fill'], ['folds', 'folds'],
    ['labels', 'labels'], ['calibration', 'calibration'], ['heatmap', 'heatmap'], ['seam-marks', 'seamMarks'], ['tabs', 'tabs']];

  // push settings back into the controls (after opening a project)
  function syncSettingsUI() {
    for (const [id, keyName] of bindings) { const el = $(id); if (el && settings[keyName] !== undefined) el.value = String(settings[keyName]); }
    for (const [id, keyName] of CHECKBOX_SETTINGS) { const el = $(id); if (el) el.checked = !!settings[keyName]; }
    $('custom-size').hidden = settings.paper !== 'custom';
    $('lw-val').textContent = `${Number(settings.lineWidth).toFixed(2)} mm`;
    $('fold-val').textContent = `${settings.foldAngle}°`;
    $('heat-legend').hidden = !settings.heatmap;
  }

  const demoKind = () => (!state.isDemo ? null : /cylinder/.test(state.rawName) ? 'cyl' : 'panel');

  function projectJSON() {
    return Project.encode({
      name: state.rawName, raw: state.raw, demo: demoKind(), unitScale: state.unitScale, upAxis: state.upAxis,
      faceGroup: state.faceGroup, blocked: state.blocked, seams: state.seams,
      settings: Object.fromEntries(PROJECT_SETTINGS.filter((k) => settings[k] !== undefined).map((k) => [k, settings[k]])),
      unwrap: { islands: $('islands').checked, tol: Number($('island-tol').value), quality: $('quality').value, autoSeam: $('auto-seam').checked },
      view: { pos: camera.position.toArray(), target: controls.target.toArray() },
      artwork: artworkForSave(),
    });
  }
  async function saveProject() {
    if (!state.model) return;
    const json = projectJSON();
    await saveFile(`${baseName()}.decal`, new Blob([json], { type: 'application/json' }));
  }

  async function openProject(file) {
    toast(i18n('msg.reading', { name: file.name }));
    let job;
    try { job = Project.decode(await file.text()); } catch (e) { toast(i18n('msg.projBad', { e: e.message }), 'bad'); return; }
    try {
      if (job.demo) loadDemo(job.demo);
      else {
        state.unitScale = job.unitScale;
        $('unit').value = String(job.unitScale);
        loadRaw(job.raw, job.name, job.upAxis, false);
      }
      const m = state.model;
      if (job.faceGroup.length !== m.nF || job.blocked.length !== m.nF || job.seams.length !== m.nE) {
        toast(i18n('msg.projMismatch'), 'bad');
        return;
      }
      state.faceGroup.set(job.faceGroup);
      state.blocked.set(job.blocked);
      state.seams.set(job.seams);
      state.undo = []; state.redo = [];
      recolorAll(); rebuildSeamLines(); updateCounts();
      for (const k of PROJECT_SETTINGS) if (job.settings[k] !== undefined) settings[k] = job.settings[k];
      syncSettingsUI();
      const u = job.unwrap || {};
      if (u.islands !== undefined) { $('islands').checked = !!u.islands; $('island-field').hidden = !u.islands; }
      if (u.tol) { $('island-tol').value = String(u.tol); $('island-val').textContent = `${Number(u.tol).toFixed(1)}%`; }
      if (u.quality) $('quality').value = u.quality;
      if (u.autoSeam !== undefined) $('auto-seam').checked = !!u.autoSeam;
      if (job.view && job.view.pos && job.view.target) {
        camera.position.fromArray(job.view.pos);
        controls.target.fromArray(job.view.target);
        controls.update();
      }
      artworkFromSave(job.artwork);
      switchTab('3d');
      toast(i18n('msg.projOpened', { name: file.name }));
    } catch (e) {
      console.error(e);
      toast(i18n('msg.projBad', { e: e.message }), 'bad');
    }
  }
  $('save-project').addEventListener('click', saveProject);
  $('open-project').addEventListener('click', () => $('project-input').click());
  $('project-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openProject(f); });

  // ---- autosave of the painting, per model, in this browser ----
  const AUTOSAVE_PREFIX = 'decal-unwrap-paint:', AUTOSAVE_INDEX = 'decal-unwrap-paint-index';
  let autosaveKey = null, autosaveDirty = false, autosaveTimer = 0;
  function armAutosave() {
    autosaveDirty = false;
    autosaveKey = !state.isDemo && state.raw ? `${AUTOSAVE_PREFIX}${Project.fingerprint(state.raw)}:${state.unitScale}:${state.upAxis}` : null;
  }
  function scheduleAutosave() {
    if (!autosaveKey || !autosaveDirty) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        const data = Project.encodePaint({ faceGroup: state.faceGroup, blocked: state.blocked, seams: state.seams, time: Date.now() });
        if (data.length > 2e6) return;
        localStorage.setItem(autosaveKey, data);
        let idx = [];
        try { idx = JSON.parse(localStorage.getItem(AUTOSAVE_INDEX) || '[]'); } catch (e) { idx = []; }
        idx = [autosaveKey, ...idx.filter((k) => k !== autosaveKey)];
        for (const old of idx.slice(8)) localStorage.removeItem(old);
        localStorage.setItem(AUTOSAVE_INDEX, JSON.stringify(idx.slice(0, 8)));
      } catch (e) { /* storage full or blocked: skip */ }
    }, 800);
  }
  // After opening a model that was painted before in this browser, offer to bring the painting back.
  function offerRestore() {
    if (!autosaveKey) return false;
    let saved = null;
    try { const t = localStorage.getItem(autosaveKey); if (t) saved = Project.decodePaint(t); } catch (e) { saved = null; }
    const m = state.model;
    if (!saved || saved.faceGroup.length !== m.nF || saved.seams.length !== m.nE) return false;
    if (!saved.faceGroup.some((g) => g) && !saved.blocked.some((b) => b) && !saved.seams.some((s) => s)) return false;
    toast(i18n('msg.restoreOffer'), '', {
      label: i18n('btn.restore'),
      fn: () => {
        pushUndo();
        state.faceGroup.set(saved.faceGroup); state.blocked.set(saved.blocked); state.seams.set(saved.seams);
        recolorAll(); rebuildSeamLines(); updateCounts();
      },
    });
    return true;
  }

  // ------------------------------------------------------------- language ---
  function applyLang(next) {
    lang = next === 'vi' ? 'vi' : 'en';
    try { localStorage.setItem('decal-unwrap-lang', lang); } catch (e) { /* storage blocked */ }
    document.documentElement.lang = lang;
    settings.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = i18n(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = i18n(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, i18n(key));
      }
    });
    document.querySelectorAll('.lang-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    updateInfo();
    updateCounts();
    updateHud();
    gzLabelFaces();
    if (state.model) rebuildSeamLines();
    if (state.pieces && state.pieces.length) relayout(); else render2D();
  }
  document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));

  // ---------------------------------------------------------- scan paper ---
  // A photo or scan of a drawing on a sheet of known size becomes a plate of
  // the drawn shapes, extruded at 1:1.
  const scanDlg = $('scan-dialog');
  const scan = { gray: null, w: 0, h: 0, bmp: null, corners: null, res: null, shapes: [], tris: null, drag: -1, timer: 0 };
  // A4 portrait / auto is always the starting point (browsers may restore an old choice)
  $('scan-paper').value = 'A4';
  $('scan-orient').value = 'auto';
  $('scan-mode').value = 'auto';
  $('scan-edge-mode').value = 'both';

  function scanPaperSize() {
    const [pw, ph] = Scan.PAPERS[$('scan-paper').value] || Scan.PAPERS.A4;
    let o = $('scan-orient').value;
    if (o === 'auto') o = scan.corners ? Scan.guessOrientation(scan.corners) : 'portrait';
    return o === 'landscape' ? [Math.max(pw, ph), Math.min(pw, ph)] : [Math.min(pw, ph), Math.max(pw, ph)];
  }

  async function scanLoad(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { toast(i18n('msg.artBad'), 'bad'); return; }
    // work on at most 2400 px; find the sheet on an 800 px copy
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, hh);
    scan.gray = Scan.toGray(g.getImageData(0, 0, w, hh).data, w, hh);
    scan.w = w; scan.h = hh; scan.bmp = cv;
    const ks = Math.min(1, 800 / Math.max(w, hh)), sw = Math.round(w * ks), sh = Math.round(hh * ks);
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const sg = small.getContext('2d', { willReadFrequently: true });
    sg.drawImage(cv, 0, 0, sw, sh);
    scan.corners = Scan.detectPaper(Scan.toGray(sg.getImageData(0, 0, sw, sh).data, sw, sh), sw, sh).map(([x, y]) => [x / ks, y / ks]);
    drawScanPhoto();
    runScan();
  }

  // photo with the sheet's quad and draggable corner dots
  function drawScanPhoto() {
    const c = $('scan-photo'), g = c.getContext('2d');
    if (!scan.bmp) { g.clearRect(0, 0, c.width, c.height); return; }
    const k = Math.min(c.width / scan.w, c.height / scan.h);
    scan.view = { k, ox: (c.width - scan.w * k) / 2, oy: (c.height - scan.h * k) / 2 };
    const { ox, oy } = scan.view;
    g.fillStyle = '#1b2029';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(scan.bmp, ox, oy, scan.w * k, scan.h * k);
    const pts = scan.corners.map(([x, y]) => [ox + x * k, oy + y * k]);
    g.strokeStyle = '#3ddc84'; g.lineWidth = 2;
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
    for (const p of pts) { g.beginPath(); g.arc(p[0], p[1], 7, 0, Math.PI * 2); g.fillStyle = 'rgba(61, 220, 132, .35)'; g.fill(); g.stroke(); }
  }

  function scanOffset(shape, d) {
    // pen line -> its centre: shrink the material by half the pen width (Clipper)
    const C = window.ClipperLib;
    if (!C || !d) return [shape];
    const S = 1000, path = (r) => { const p = []; for (let i = 0; i < r.length; i += 2) p.push({ X: Math.round(r[i] * S), Y: Math.round(r[i + 1] * S) }); return p; };
    const co = new C.ClipperOffset(2, 0.01 * S);
    co.AddPaths([path(shape.outer), ...shape.holes.map(path)], C.JoinType.jtRound, C.EndType.etClosedPolygon);
    const tree = new C.PolyTree();
    co.Execute(tree, -d * S);
    const out = [];
    const ring = (p) => { const r = []; for (const q of p) r.push(q.X / S, q.Y / S); return r; };
    const walk = (node) => {
      for (const ch of node.Childs()) {
        if (!ch.IsHole()) out.push({ outer: ring(ch.Contour()), holes: ch.Childs().map((hc) => ring(hc.Contour())) });
        for (const hc of ch.Childs()) walk(hc);
      }
    };
    walk(tree);
    return out;
  }

  function runScan() {
    clearTimeout(scan.timer);
    scan.timer = setTimeout(() => {
      if (!scan.gray) return;
      const paper = scanPaperSize();
      try {
        scan.res = Scan.extract(scan.gray, scan.w, scan.h, scan.corners, paper, {
          mode: $('scan-mode').value, sensitivity: Number($('scan-sens').value) / 100, minArea: Math.max(0, Number($('scan-min').value) || 0),
        });
      } catch (e) { scan.res = null; }
      const half = scan.res && scan.res.stroke ? scan.res.stroke / 2 : 0;
      scan.shapes = scan.res ? scan.res.shapes.flatMap((s) => scanOffset(s, half)) : [];
      // optional correction to measured true sizes (x and y separately)
      scan.measured = null; scan.factor = [1, 1];
      if (scan.shapes.length) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const sh of scan.shapes) for (let i = 0; i < sh.outer.length; i += 2) { x0 = Math.min(x0, sh.outer[i]); x1 = Math.max(x1, sh.outer[i]); y0 = Math.min(y0, sh.outer[i + 1]); y1 = Math.max(y1, sh.outer[i + 1]); }
        const mw = x1 - x0, mh = y1 - y0, rw = Number($('scan-realw').value) || 0, rh = Number($('scan-realh').value) || 0;
        scan.measured = [mw, mh];
        const fx = rw > 0 ? rw / mw : rh > 0 ? rh / mh : 1, fy = rh > 0 ? rh / mh : fx;
        if (fx !== 1 || fy !== 1) {
          scan.factor = [fx, fy];
          const sc = (r) => r.map((v, i) => (i % 2 ? y0 + (v - y0) * fy : x0 + (v - x0) * fx));
          scan.shapes = scan.shapes.map((sh) => ({ outer: sc(sh.outer), holes: sh.holes.map(sc) }));
        }
      }
      scan.shapes = roundCorners(scan.shapes, Math.max(0, Number($('scan-corner').value) || 0));
      scan.tris = scan.shapes.length
        ? scanTriangles(scan.shapes, Math.max(0.4, Number($('scan-thick').value) || 3), Math.max(0, Number($('scan-edge').value) || 0), $('scan-edge-mode').value === 'both')
        : null;
      drawScanResult();
    }, 120);
  }

  // extrude the outlines (mm, y down on the sheet) into a plate lying on z = 0
  // Round the outline's corners in plan: closing rounds the inner (concave)
  // corners, opening the outer (convex) ones, both with radius R (mm).
  function roundCorners(shapes, R) {
    if (!(R > 0) || !window.ClipperLib) return shapes;
    const grow = (list, d) => list.flatMap((s) => scanOffset(s, -d));
    const shrink = (list, d) => list.flatMap((s) => scanOffset(s, d));
    return grow(shrink(shrink(grow(shapes, R), R), R), R);
  }

  const ringLen = (r) => { let s = 0; const n = r.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += Math.hypot(r[2 * j] - r[2 * i], r[2 * j + 1] - r[2 * i + 1]); } return s; };
  const ringArea2 = (r) => { let s = 0; const n = r.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1]; } return s / 2; };
  const ringCentre = (r) => { let x = 0, y = 0; const n = r.length / 2; for (let i = 0; i < n; i++) { x += r[2 * i]; y += r[2 * i + 1]; } return [x / n, y / n]; };
  // N points evenly along a closed ring, starting at the vertex nearest to 'start'
  function resample(r, N, start) {
    const n = r.length / 2;
    let s0 = 0;
    if (start) { let bd = Infinity; for (let i = 0; i < n; i++) { const d = (r[2 * i] - start[0]) ** 2 + (r[2 * i + 1] - start[1]) ** 2; if (d < bd) { bd = d; s0 = i; } } }
    const pts = [], L = ringLen(r), step = L / N;
    let i = s0, acc = 0, target = 0;
    for (let k = 0; k < n && pts.length < N; k++) {
      const a = i, b = (i + 1) % n;
      const ax = r[2 * a], ay = r[2 * a + 1], bx = r[2 * b], by = r[2 * b + 1], l = Math.hypot(bx - ax, by - ay);
      while (pts.length < N && target <= acc + l + 1e-9) { const t = l > 0 ? (target - acc) / l : 0; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); target += step; }
      acc += l; i = b;
    }
    while (pts.length < N) pts.push([r[2 * s0], r[2 * s0 + 1]]);
    return pts;
  }

  // One plate as a closed mesh: a wall lofted through inset outlines (the edge
  // fillet profile), a flat or rounded bottom, and caps. Coordinates in mm, y
  // flipped to y-up. Returns null when insetting changes the shape's topology.
  function loftShape(shape, T, r, both) {
    const n = 6, lv = [];
    if (r > 0 && both) for (let k = n; k >= 0; k--) { const t = (k * Math.PI) / 2 / n; lv.push({ z: r - r * Math.sin(t), d: r * (1 - Math.cos(t)) }); }
    else lv.push({ z: 0, d: 0 });
    if (r > 0) for (let k = 0; k <= n; k++) { const t = (k * Math.PI) / 2 / n; lv.push({ z: T - r + r * Math.sin(t), d: r * (1 - Math.cos(t)) }); }
    else lv.push({ z: T, d: 0 });
    const levels = lv.filter((l, i) => i === 0 || l.z - lv[i - 1].z > 1e-6 || l.d !== lv[i - 1].d);
    const maxD = Math.max(...levels.map((l) => l.d));
    // y-up rings: outer anticlockwise, holes clockwise
    const flip = (r0) => { const o = r0.map((v, i) => (i % 2 ? -v : v)); return o; };
    const orient = (r0, pos) => { if ((ringArea2(r0) > 0) === pos) return r0; const o = []; for (let i = r0.length - 2; i >= 0; i -= 2) o.push(r0[i], r0[i + 1]); return o; };
    const base = { outer: orient(flip(shape.outer), true), holes: shape.holes.map((h) => orient(flip(h), false)) };
    const sets = [];
    for (const l of levels) {
      let s = base;
      if (l.d > 1e-6) {
        // scanOffset works in the sheet's y-down frame; flip there and back
        const down = { outer: flip(base.outer), holes: base.holes.map(flip) };
        const res = scanOffset(down, l.d);
        if (res.length !== 1 || res[0].holes.length !== base.holes.length) return null;
        // a thin arm that disappears when inset also changes the shape: grow the
        // inset back and see how much area is gone (round corners lose very little)
        if (l.d === maxD) {
          const back = scanOffset(res[0], -l.d);
          const areaOf = (sh) => Math.abs(ringArea2(sh.outer)) - sh.holes.reduce((t, hl) => t + Math.abs(ringArea2(hl)), 0);
          const a0 = areaOf(down), a1 = back.reduce((t, sh) => t + areaOf(sh), 0);
          if (a0 - a1 > 0.08 * a0) return null;
          // every part of the outline must still have inset outline close by
          // (a sharp corner's tip stays within ~4 d; a lost arm is much further)
          const ins = res[0].outer, M = ins.length / 2, lim = (4 * l.d + 0.3) ** 2, bo = down.outer, nb = bo.length / 2;
          const stride = Math.max(1, Math.floor(nb / 400));
          for (let i = 0; i < nb; i += stride) {
            const qx = bo[2 * i], qy = bo[2 * i + 1];
            let best = Infinity;
            for (let s2 = 0; s2 < M && best > lim; s2++) {
              const e = (s2 + 1) % M, ax = ins[2 * s2], ay = ins[2 * s2 + 1], ex = ins[2 * e] - ax, ey = ins[2 * e + 1] - ay, L2 = ex * ex + ey * ey;
              const t = L2 > 0 ? Math.max(0, Math.min(1, ((qx - ax) * ex + (qy - ay) * ey) / L2)) : 0;
              best = Math.min(best, (ax + ex * t - qx) ** 2 + (ay + ey * t - qy) ** 2);
            }
            if (best > lim) return null;
          }
        }
        s = { outer: orient(flip(res[0].outer), true), holes: res[0].holes.map((h) => orient(flip(h), false)) };
      }
      sets.push(s);
    }
    // match each hole to the original one by its centre
    const contours = [sets.map((s) => s.outer)];
    base.holes.forEach((h, j) => {
      const c0 = ringCentre(h);
      contours.push(sets.map((s, k) => (k === 0 ? s.holes[j] : s.holes.reduce((best, x) => { const c = ringCentre(x), cb = ringCentre(best); return Math.hypot(c[0] - c0[0], c[1] - c0[1]) < Math.hypot(cb[0] - c0[0], cb[1] - c0[1]) ? x : best; }))));
    });
    const out = [];
    const tri = (p, q, s) => out.push(p[0], p[1], p[2], q[0], q[1], q[2], s[0], s[1], s[2]);
    // ring points with z, plus arc length along the ring
    const pts3 = (ring, z) => { const p = []; for (let i = 0; i < ring.length; i += 2) p.push([ring[i], ring[i + 1], z]); return p; };
    const cumOf = (ring) => { const M = ring.length / 2, c = new Float64Array(M + 1); for (let q = 0; q < M; q++) { const e = (q + 1) % M; c[q + 1] = c[q] + Math.hypot(ring[2 * e] - ring[2 * q], ring[2 * e + 1] - ring[2 * q + 1]); } return c; };
    // For each point of 'ring', the arc position of its nearest point on 'ref'.
    // An inset outline lies at a fixed distance from the outline it came from, so
    // these foot points run along 'ref' in order: that pairs the two outlines
    // without twist, whatever their point counts.
    function feet(ring, ref, refCum, step) {
      const M = ref.length / 2, n = ring.length / 2, u = new Float64Array(n);
      let j = -1;
      const near = (qx, qy, from, count) => {
        let best = Infinity, bu = 0, bj = 0;
        for (let s = 0; s < count; s++) {
          const sj = (((from + s) % M) + M) % M, ej = (sj + 1) % M;
          const ax = ref[2 * sj], ay = ref[2 * sj + 1], ex = ref[2 * ej] - ax, ey = ref[2 * ej + 1] - ay, L2 = ex * ex + ey * ey;
          const t = L2 > 0 ? Math.max(0, Math.min(1, ((qx - ax) * ex + (qy - ay) * ey) / L2)) : 0;
          const dd = (ax + ex * t - qx) ** 2 + (ay + ey * t - qy) ** 2;
          if (dd < best) { best = dd; bj = sj; bu = refCum[sj] + t * (refCum[sj + 1] - refCum[sj]); }
        }
        return [best, bu, bj];
      };
      for (let i = 0; i < n; i++) {
        const qx = ring[2 * i], qy = ring[2 * i + 1];
        let r = j < 0 ? near(qx, qy, 0, M) : near(qx, qy, j - 30, 160);
        if (j >= 0 && Math.sqrt(r[0]) > 3 * step + 0.3) r = near(qx, qy, 0, M);
        u[i] = r[1]; j = r[2];
      }
      return u;
    }
    // zip two outlines (A below, B above) into a wall strip; ua / ub are both
    // arc positions on the same reference outline of length L
    function zip(A, B, ua, ub, L) {
      const nA = A.length, nB = B.length;
      let j0 = 0, bd = Infinity;
      for (let j = 0; j < nB; j++) { let d = Math.abs(ub[j] - ua[0]); d = Math.min(d, L - d); if (d < bd) { bd = d; j0 = j; } }
      const unwrap = (u, n, s0, ref) => {
        const o = new Float64Array(n + 1);
        for (let k = 0; k < n; k++) {
          let v = u[(s0 + k) % n] - ref;
          v -= Math.round(v / L) * L;
          if (k > 0) { while (v < o[k - 1] - L / 2) v += L; v = Math.max(v, o[k - 1]); }
          o[k] = k > 0 ? Math.min(v, o[0] + L) : v;
        }
        o[n] = o[0] + L;
        return o;
      };
      const pa = unwrap(ua, nA, 0, ua[0]), pb = unwrap(ub, nB, j0, ua[0]);
      let i = 0, j = 0;
      while (i < nA || j < nB) {
        const a = A[i % nA], b = B[(j0 + j) % nB];
        if (j >= nB || (i < nA && pa[i + 1] <= pb[j + 1])) { tri(a, A[(i + 1) % nA], b); i++; }
        else { tri(a, B[(j0 + j + 1) % nB], b); j++; }
      }
    }
    const step = levels.reduce((m, l, k) => (k ? Math.max(m, Math.abs(l.d - levels[k - 1].d)) : m), 0);
    const rings3 = contours.map((rings) => rings.map((ring, k) => pts3(ring, levels[k].z)));
    contours.forEach((rings, c) => {
      for (let k = 0; k + 1 < rings.length; k++) {
        // foot points go from the more inset outline onto the less inset one
        const upIn = levels[k + 1].d >= levels[k].d;
        const ref = upIn ? rings[k] : rings[k + 1], other = upIn ? rings[k + 1] : rings[k];
        const cum = cumOf(ref), L = cum[ref.length / 2];
        const own = cum.subarray(0, ref.length / 2), ft = feet(other, ref, cum, step);
        if (upIn) zip(rings3[c][k], rings3[c][k + 1], own, ft, L);
        else zip(rings3[c][k], rings3[c][k + 1], ft, own, L);
      }
    });
    // caps from the same ring points, so the mesh is closed
    const cap = (k, up) => {
      const rings = rings3.map((R) => R[k]);
      const v2 = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));
      const faces = THREE.ShapeUtils.triangulateShape(v2(rings[0]), rings.slice(1).map(v2));
      const all = rings.flat();
      for (const [i0, i1, i2] of faces) {
        const p = all[i0], q = all[i1], s = all[i2];
        const ccw = (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]) > 0;
        if (ccw === up) tri(p, q, s); else tri(p, s, q);
      }
    };
    cap(0, false);
    cap(levels.length - 1, true);
    return out;
  }

  // extrude the outlines (mm, y down on the sheet) into a plate lying on z = 0,
  // with an optional rounded edge of radius r (top only, or top and bottom)
  function scanTriangles(shapes, thick, r = 0, both = false) {
    scan.edgeNote = '';
    const maxR = Math.max(0, both ? thick / 2 - 0.01 : thick - 0.01);
    const want = Math.min(Math.max(0, r), maxR);
    const parts = [];
    let reduced = 0;
    for (const s of shapes) {
      let rr = want, m = null;
      for (let tries = 0; tries < 6 && !m; tries++) { m = loftShape(s, thick, rr, both); if (!m) { rr *= 0.6; reduced++; } }
      if (!m) m = loftShape(s, thick, 0, false);
      if (m) parts.push(m);
    }
    if (want < r - 1e-6) scan.edgeNote = i18n('scan.edgeMax', { r: want.toFixed(1) });
    else if (reduced) scan.edgeNote = i18n('scan.edgeReduced');
    return Float32Array.from(parts.flat());
  }

  function drawScanResult() {
    const c = $('scan-result'), g = c.getContext('2d');
    g.fillStyle = '#1b2029';
    g.fillRect(0, 0, c.width, c.height);
    const r = scan.res;
    $('scan-use').disabled = $('scan-stl').disabled = !scan.tris;
    if (!r) { $('scan-stats').textContent = i18n(scan.gray ? 'scan.nothing' : 'scan.none'); return; }
    const k = Math.min(c.width / r.W, c.height / r.H), ox = (c.width - r.W * k) / 2, oy = (c.height - r.H * k) / 2;
    // the straightened sheet, greyed
    const img = g.createImageData(Math.round(r.W * k), Math.round(r.H * k));
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const v = r.rect[Math.min(r.H - 1, Math.floor(y / k)) * r.W + Math.min(r.W - 1, Math.floor(x / k))];
      const o = 4 * (y * img.width + x);
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 120 + v * 0.45; img.data[o + 3] = 255;
    }
    g.putImageData(img, Math.round(ox), Math.round(oy));
    const s = k * r.ppm;
    g.beginPath();
    for (const sh of scan.shapes) for (const ring of [sh.outer, ...sh.holes]) {
      for (let i = 0; i < ring.length; i += 2) { const x = ox + ring[i] * s, y = oy + ring[i + 1] * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath();
    }
    g.fillStyle = 'rgba(47, 111, 237, .45)'; g.fill('evenodd');
    g.strokeStyle = '#2f6fed'; g.lineWidth = 1.5; g.stroke();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sh of scan.shapes) for (let i = 0; i < sh.outer.length; i += 2) { x0 = Math.min(x0, sh.outer[i]); x1 = Math.max(x1, sh.outer[i]); y0 = Math.min(y0, sh.outer[i + 1]); y1 = Math.max(y1, sh.outer[i + 1]); }
    const corr = scan.factor && (scan.factor[0] !== 1 || scan.factor[1] !== 1)
      ? ' ' + i18n('scan.corrected', { w: scan.measured[0].toFixed(1), h: scan.measured[1].toFixed(1), fx: scan.factor[0].toFixed(4), fy: scan.factor[1].toFixed(4) })
      : '';
    $('scan-stats').textContent = scan.shapes.length
      ? `${$('scan-paper').value} ${i18n(r.W > r.H ? 'orient.landscape' : 'orient.portrait')} · ${$('scan-mode').value === 'auto' ? i18n(r.mode === 'filled' ? 'scan.filled' : 'scan.outline') + ' · ' : ''}` + i18n('scan.stats', { n: scan.shapes.length, w: (x1 - x0).toFixed(1), h: (y1 - y0).toFixed(1), pen: r.stroke ? r.stroke.toFixed(1) : '–' }) + corr
      : i18n('scan.nothing');
    if (scan.shapes.length && scan.edgeNote) $('scan-stats').textContent += ' · ' + scan.edgeNote;
  }

  const scanPoint = (e) => {
    const c = $('scan-photo'), rect = c.getBoundingClientRect(), v = scan.view;
    const cx = ((e.clientX - rect.left) / rect.width) * c.width, cy = ((e.clientY - rect.top) / rect.height) * c.height;
    return [(cx - v.ox) / v.k, (cy - v.oy) / v.k, cx, cy];
  };
  $('scan-photo').addEventListener('pointerdown', (e) => {
    if (!scan.corners) return;
    const [, , cx, cy] = scanPoint(e), v = scan.view;
    let best = -1, bd = 24;
    scan.corners.forEach(([x, y], i) => { const d = Math.hypot(v.ox + x * v.k - cx, v.oy + y * v.k - cy); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    scan.drag = best;
    try { $('scan-photo').setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  $('scan-photo').addEventListener('pointermove', (e) => {
    if (scan.drag < 0) return;
    const [x, y] = scanPoint(e);
    scan.corners[scan.drag] = [Math.max(0, Math.min(scan.w - 1, x)), Math.max(0, Math.min(scan.h - 1, y))];
    drawScanPhoto();
    runScan();
  });
  const endScanDrag = () => { scan.drag = -1; };
  $('scan-photo').addEventListener('pointerup', endScanDrag);
  $('scan-photo').addEventListener('pointercancel', endScanDrag);

  function openScan(file) {
    drawScanPhoto(); drawScanResult();
    if (!scanDlg.open) { if (typeof scanDlg.showModal === 'function') scanDlg.showModal(); else scanDlg.setAttribute('open', ''); }
    if (file) scanLoad(file);
  }
  $('scan-open').addEventListener('click', () => openScan());
  // the open model as STL in mm (a scanned plate, or any loaded file in its own orientation)
  $('model-stl').addEventListener('click', async () => {
    if (!state.raw) return;
    const k = state.unitScale || 1, tris = k === 1 ? state.raw : Float32Array.from(state.raw, (v) => v * k);
    await saveFile(`${baseName()}.stl`, new Blob([Scan.toSTL(tris, baseName())], { type: 'model/stl' }));
  });
  scanDlg.addEventListener('dragover', (e) => { e.preventDefault(); scanDlg.classList.add('drop-on'); });
  scanDlg.addEventListener('dragleave', (e) => { if (e.target === scanDlg || !scanDlg.contains(e.relatedTarget)) scanDlg.classList.remove('drop-on'); });
  scanDlg.addEventListener('drop', (e) => {
    e.preventDefault();
    scanDlg.classList.remove('drop-on');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) scanLoad(f); else if (f) toast(i18n('msg.artBad'), 'bad');
  });
  // Ctrl+V with an image: scan dialog if open; in the 2D tab, artwork for the selected
  // piece; otherwise start a scan with it
  window.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((it) => it.kind === 'file' && /^image\//.test(it.type));
    const f = item && item.getAsFile();
    if (!f) return;
    e.preventDefault();
    if (scanDlg.open) scanLoad(f);
    else if (currentTab === '2d') { if (artSel === null) toast(i18n('art.pick')); else applyArtFile(f); }
    else openScan(f);
  });
  $('scan-cancel').addEventListener('click', () => scanDlg.close());
  $('scan-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) scanLoad(f); });
  for (const id of ['scan-paper', 'scan-orient', 'scan-mode', 'scan-sens', 'scan-thick', 'scan-min', 'scan-realw', 'scan-realh', 'scan-corner', 'scan-edge', 'scan-edge-mode']) $(id).addEventListener('input', runScan);
  const scanName = () => `scan-${$('scan-paper').value}`;
  $('scan-stl').addEventListener('click', async () => {
    if (!scan.tris) return;
    await saveFile(`${scanName()}.stl`, new Blob([Scan.toSTL(scan.tris, scanName())], { type: 'model/stl' }));
  });
  $('scan-use').addEventListener('click', () => {
    if (!scan.tris) return;
    state.unitScale = 1;
    $('unit').value = '1';
    loadRaw(scan.tris, `${scanName()}.stl`, 'z', false);
    // a flat plate: look at it from above and a little in front, sizes shown for checking
    fitView(new THREE.Vector3(0, 1, 0.6), false);
    setDims(true);
    scanDlg.close();
    switchTab('3d');
    toast(i18n('msg.scanOpened', { n: scan.shapes.length }));
  });

  // privacy & disclaimer dialog (a click on the dimmed backdrop closes it too)
  const privacy = $('privacy-dialog');
  $('privacy-open').addEventListener('click', () => {
    if (typeof privacy.showModal === 'function') privacy.showModal(); else privacy.setAttribute('open', '');
  });
  privacy.addEventListener('click', (e) => { if (e.target === privacy) privacy.close(); });

  // ---------------------------------------------------------------- start ---
  setTool('brush');
  updateCounts();
  try {
    loadDemo('panel');
  } catch (e) {
    console.error(e);
    $('empty-3d').hidden = false;
  }
  applyLang(lang);
  window.__decal = {
    state, settings, relayout, generate, camera, controls, bucketFill, pick, shortestPath, Geo, Flat, Layout, Project, fitView, projectJSON, openProject,
    // draw one frame now (the animation loop pauses while the page is hidden)
    scanDebug: () => ({ scan, loftShape, scanOffset, scanTriangles, roundCorners }),
    renderNow: (t) => { stepCamAnim(t === undefined ? performance.now() : t); controls.update(); renderer.render(scene, camera); gzDirty = true; renderGizmo(); },
  };
})();
