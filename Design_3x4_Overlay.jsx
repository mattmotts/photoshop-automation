#target photoshop
app.bringToFront();

/* ====== CONFIG ====== */
// Preserve AR: "contain" = fit inside PSB (letterbox if needed), "cover" = fill PSB (may crop).
var FIT_MODE = "contain";

/* ====== Helpers ====== */
function px(u){ return u.as("px"); }

function openCopy(file) {
    var doc = app.open(file);
    doc.selection.selectAll();
    doc.selection.copy();
    doc.close(SaveOptions.DONOTSAVECHANGES);
}

function ensureEmbeddedSO() {
    try { executeAction(stringIDToTypeID('placedLayerConvertToEmbedded'), new ActionDescriptor(), DialogModes.NO); } catch(e){}
}

function openSmartObjectContents(lyr) {
    if (!lyr || lyr.kind !== LayerKind.SMARTOBJECT) throw new Error("Layer is not a Smart Object.");
    app.activeDocument.activeLayer = lyr;
    ensureEmbeddedSO();
    executeAction(stringIDToTypeID('placedLayerEditContents'), new ActionDescriptor(), DialogModes.NO);
}

function fitActiveLayerToCanvas_AR(doc) {
    var lyr = doc.activeLayer;

    // layer bounds
    var b = lyr.bounds;
    var l=px(b[0]), t=px(b[1]), r=px(b[2]), btm=px(b[3]);
    var lw = r - l, lh = btm - t;
    if (lw <= 0 || lh <= 0) return;

    // canvas size
    var cw = doc.width.as("px"), ch = doc.height.as("px");

    // preserve AR
    var scale = (FIT_MODE === "cover") ? Math.max(cw/lw, ch/lh) : Math.min(cw/lw, ch/lh);
    lyr.resize(scale*100, scale*100, AnchorPosition.MIDDLECENTER);

    // re-center
    b = lyr.bounds; l=px(b[0]); t=px(b[1]); r=px(b[2]); btm=px(b[3]);
    var cx = (l + r)/2, cy = (t + btm)/2;
    var dcx = (cw/2) - cx, dcy = (ch/2) - cy;
    if (dcx || dcy) lyr.translate(dcx, dcy);
}

function forEachImmediateLayer(set, fn){ for (var i=0;i<set.layers.length;i++) fn(set.layers[i], i); }

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG; o.PNG8 = false; o.transparency = true;
    o.interlaced = false; o.optimized = true;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

/* ====== Main ====== */
(function main(){
    if (!app.documents.length) { alert("Open your PSD first."); return; }

    // Select input (ideally .../_by_ratio/3x4_input)
    var inFolder = Folder.selectDialog("Select 3x4_input folder");
    if (!inFolder) { alert("No input folder selected."); return; }

    // Auto-pick sibling _output if possible
    var outFolder;
    var inName = inFolder.displayName || inFolder.name;
    if (/_input$/i.test(inName)) {
        var outPath = inFolder.fsName.replace(/_input$/i, "_output");
        outFolder = Folder(outPath);
        if (!outFolder.exists) outFolder.create();
    } else {
        outFolder = Folder.selectDialog("Select output folder for PNGs");
        if (!outFolder) { alert("No output folder selected."); return; }
    }

    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found in input."); return; }

    // User must select the TEMPLATE group (contains the two SO layers)
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE group (two SO layers) and run again.");
        return;
    }

    // Collect SO layers (Normal @60%, Multiply @100%) in the group
    var soLayers = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) soLayers.push(lyr);
    });
    if (soLayers.length < 2) { alert("Template group must contain two Smart Object layers."); return; }

    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    for (var i=0;i<files.length;i++) {
        var f = files[i]; if (!(f instanceof File)) continue;

        // Paste design into each SO PSB with AR preserved
        for (var s=0;s<soLayers.length;s++) {
            openSmartObjectContents(soLayers[s]);   // inside PSB
            var soDoc = app.activeDocument;

            openCopy(f);                             // copy from source
            soDoc.paste();                           // pasted layer active

            // Remove other layers so only the pasted layer remains
            var keep = soDoc.activeLayer;
            for (var k = soDoc.layers.length - 1; k >= 0; k--) {
                var L = soDoc.layers[k];
                if (L !== keep) try { L.remove(); } catch(e){}
            }

            // Fit with preserved AR for 3x4 canvas
            fitActiveLayerToCanvas_AR(soDoc);

            soDoc.close(SaveOptions.SAVECHANGES);    // update parent
        }

        // Export composite
        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    app.preferences.rulerUnits = oldUnits;
    alert("✅ 3x4 overlay complete. Exports saved to:\n" + outFolder.fsName);
})();
