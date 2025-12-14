'target photoshop'
app.bringToFront();

/* ============================================================
   UNIVERSAL BATCH OVERLAY (Multi-Ratio) — Photoshop JSX
   ------------------------------------------------------------
   • Place designs into a TEMPLATE group containing 2 Smart Objects
     (e.g., Normal @60% + Multiply @100%).
   • Works for any aspect ratio; the Smart Object PSB canvas defines fit.
   • Processes all "*_input" folders under a chosen base folder and
     exports to sibling "*_output" folders (auto-created).
   • Prompts once per ratio (e.g., "1x1", "2x3", "3x4") to pick its template PSD.
   • Optional single-folder mode if no pattern is found.

   Requirements for template PSDs:
   - A top-level LayerSet named "TEMPLATE" containing exactly two Smart Object layers.
   - The SO contents (PSB) should be the correct canvas/AR for that template.

   Tips:
   - Standardize your input designs by AR (and ideally trim transparency).
   - This script trims transparency automatically on paste.
   ============================================================ */

/* ====== CONFIG ====== */
// "contain" = fit entirely inside PSB (may letterbox), "cover" = fill PSB (may crop).
var FIT_MODE = "contain";
// Small margin to give designs breathing room (1.00 = none, 0.97 = 3% margin).
var FIT_MARGIN = 0.97;
// Export format: PNG-24 with transparency
var EXPORT_INTERLACED = false;
var EXPORT_OPTIMIZED  = true;

/* ====== Helpers ====== */
function px(u){ return u.as("px"); }

function ensureEmbeddedSO() {
    try { executeAction(stringIDToTypeID('placedLayerConvertToEmbedded'), new ActionDescriptor(), DialogModes.NO); } catch(e){}
}

function openSmartObjectContents(lyr) {
    if (!lyr || lyr.kind !== LayerKind.SMARTOBJECT) throw new Error("Layer is not a Smart Object.");
    app.activeDocument.activeLayer = lyr;
    ensureEmbeddedSO();
    executeAction(stringIDToTypeID('placedLayerEditContents'), new ActionDescriptor(), DialogModes.NO);
}

function fitActiveLayerToCanvas(doc) {
    var lyr = doc.activeLayer;
    var b = lyr.bounds;
    var l=px(b[0]), t=px(b[1]), r=px(b[2]), btm=px(b[3]);
    var lw = r - l, lh = btm - t;
    if (lw <= 0 || lh <= 0) return;

    var cw = doc.width.as("px"), ch = doc.height.as("px");
    var scale = (FIT_MODE === "cover") ? Math.max(cw/lw, ch/lh) : Math.min(cw/lw, ch/lh);
    scale = scale * FIT_MARGIN;

    lyr.resize(scale*100, scale*100, AnchorPosition.MIDDLECENTER);

    // Re-center after resize
    b = lyr.bounds; l=px(b[0]); t=px(b[1]); r=px(b[2]); btm=px(b[3]);
    var cx = (l + r)/2, cy = (t + btm)/2;
    var dcx = (cw/2) - cx, dcy = (ch/2) - cy;
    if (dcx || dcy) lyr.translate(dcx, dcy);
}

function forEachImmediateLayer(set, fn){
    for (var i=0;i<set.layers.length;i++) fn(set.layers[i], i);
}

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG;
    o.PNG8 = false;
    o.transparency = true;
    o.interlaced = EXPORT_INTERLACED;
    o.optimized = EXPORT_OPTIMIZED;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

function trimAndCopy(file) {
    var doc = app.open(file);
    try { doc.trim(TrimType.TRANSPARENT); } catch(e) {}
    doc.selection.selectAll();
    doc.selection.copy();
    doc.close(SaveOptions.DONOTSAVECHANGES);
}

function collectSmartObjectsFromTemplateGroup(doc) {
    var templateGroup = null;

    // Prefer a LayerSet named "TEMPLATE"
    for (var i=0; i<doc.layerSets.length; i++){
        if (doc.layerSets[i].name.toUpperCase() === "TEMPLATE") {
            templateGroup = doc.layerSets[i];
            break;
        }
    }

    // Fallback: if active layer is a LayerSet, treat it as TEMPLATE
    if (!templateGroup && doc.activeLayer && doc.activeLayer.typename === "LayerSet"){
        templateGroup = doc.activeLayer;
    }

    if (!templateGroup) throw new Error('Could not find TEMPLATE group. Name a top-level group "TEMPLATE" or select your template group before running.');

    var soLayers = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) soLayers.push(lyr);
    });
    if (soLayers.length < 2) throw new Error("The TEMPLATE group must contain at least two Smart Object layers.");

    return { group: templateGroup, soLayers: soLayers };
}

function getRatioNameFromFolder(folder) {
    var name = (folder.displayName || folder.name);
    // Expected patterns like "1x1_input", "2x3_input", "3x4_input"
    var m = name.match(/^(\d+x\d+)_input$/i);
    return m ? m[1].toLowerCase() : null;
}

function pickTemplatePSDForRatio(ratio, guessFolder) {
    // Try auto-guess: tpl_<ratio>.psd in the same folder as the input's parent or base folder
    var candidates = [];
    if (guessFolder && guessFolder.exists) {
        var parent = guessFolder.parent;
        if (parent && parent.exists) {
            candidates.push(File(parent.fsName + "/tpl_" + ratio + ".psd"));
            candidates.push(File(parent.fsName + "/template_" + ratio + ".psd"));
        }
    }
    for (var i=0;i<candidates.length;i++){
        if (candidates[i].exists) return candidates[i];
    }
    // Ask user
    return File.openDialog("Select the template PSD for ratio " + ratio + " (expects a TEMPLATE group with two Smart Objects)", "Photoshop PSD:*.psd");
}

function getInputFolders(baseFolder) {
    var list = [];
    var items = baseFolder.getFiles();
    for (var i=0; i<items.length; i++){
        var it = items[i];
        if (it instanceof Folder) {
            var nm = (it.displayName || it.name);
            if (/_input$/i.test(nm)) list.push(it);
        }
    }
    return list;
}

function getOutputFolderForInput(inFolder) {
    var inName = inFolder.displayName || inFolder.name;
    if (/_input$/i.test(inName)) {
        var outPath = inFolder.fsName.replace(/_input$/i, "_output");
        var outFolder = new Folder(outPath);
        if (!outFolder.exists) outFolder.create();
        return outFolder;
    }
    var chosen = Folder.selectDialog("Select output folder");
    if (chosen && !chosen.exists) chosen.create();
    return chosen;
}

function processOneFolderWithTemplate(inFolder, tplFile) {
    if (!tplFile || !tplFile.exists) { alert("Template PSD not selected or missing."); return; }

    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found in: " + inFolder.fsName); return; }

    var outFolder = getOutputFolderForInput(inFolder);
    if (!outFolder) { alert("No output folder chosen."); return; }

    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    var tpl = app.open(tplFile);
    var meta = collectSmartObjectsFromTemplateGroup(tpl);
    var soLayers = meta.soLayers;

    for (var i=0; i<files.length; i++){
        var f = files[i]; if (!(f instanceof File)) continue;

        for (var s=0; s<soLayers.length; s++){
            openSmartObjectContents(soLayers[s]); // enter PSB
            var soDoc = app.activeDocument;

            // Place content (trim to remove transparent margins)
            trimAndCopy(f);
            soDoc.paste(); // pasted layer is active

            // Keep only the pasted layer
            var keep = soDoc.activeLayer;
            for (var k = soDoc.layers.length - 1; k >= 0; k--) {
                var L = soDoc.layers[k];
                if (L !== keep) { try { L.remove(); } catch(e){} }
            }

            fitActiveLayerToCanvas(soDoc);

            soDoc.close(SaveOptions.SAVECHANGES); // update SO in template
        }

        // Export composite
        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    tpl.close(SaveOptions.DONOTSAVECHANGES);
    app.preferences.rulerUnits = oldUnits;
}

/* ====== Orchestrator ====== */
(function main(){
    if (!app) { alert("Photoshop not available."); return; }

    // Ask user for the base folder that contains multiple "*_input" folders (e.g., 1x1_input, 2x3_input, 3x4_input)
    var baseFolder = Folder.selectDialog("Select your base folder (containing ratio subfolders like 1x1_input, 2x3_input, 3x4_input).");
    if (!baseFolder) { alert("No folder selected."); return; }

    var inputFolders = getInputFolders(baseFolder);

    // If no "*_input" folders were found, fall back to single-folder mode
    if (!inputFolders.length) {
        var singleIn = Folder.selectDialog("No '*_input' folders found. Select a single input folder instead.");
        if (!singleIn) { alert("No input folder selected."); return; }
        var ratioGuess = getRatioNameFromFolder(singleIn) || "unknown";
        var tplSingle = pickTemplatePSDForRatio(ratioGuess, singleIn);
        if (!tplSingle) { alert("No template PSD selected."); return; }

        processOneFolderWithTemplate(singleIn, tplSingle);
        alert("✅ Batch complete for: " + (singleIn.displayName || singleIn.name) + "\nExports in: " + getOutputFolderForInput(singleIn).fsName);
        return;
    }

    // Multi-ratio mode: prompt once per ratio for its template PSD, then process
    var tplMap = {}; // ratio -> File
    for (var i=0; i<inputFolders.length; i++){
        var inFolder = inputFolders[i];
        var ratio = getRatioNameFromFolder(inFolder) || "unknown";

        if (!tplMap[ratio]) {
            var tpl = pickTemplatePSDForRatio(ratio, inFolder);
            if (!tpl) { alert("Template not selected for ratio: " + ratio + ". Skipping."); continue; }
            tplMap[ratio] = tpl;
        }

        processOneFolderWithTemplate(inFolder, tplMap[ratio]);
    }

    alert("✅ All batches complete.\nProcessed folders under:\n" + baseFolder.fsName);
})();
