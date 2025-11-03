#target photoshop
app.bringToFront();

/* ----------------- helpers ----------------- */

function px(u){ return u.as("px"); }

function openCopy(file) {
    // open design, copy all pixels to clipboard, close w/o saving
    var doc = app.open(file);
    doc.selection.selectAll();
    doc.selection.copy();
    doc.close(SaveOptions.DONOTSAVECHANGES);
}

function ensureEmbeddedSO() {
    // if linked, convert to embedded so edits happen in PSB
    try {
        executeAction(stringIDToTypeID('placedLayerConvertToEmbedded'), new ActionDescriptor(), DialogModes.NO);
    } catch (e) { /* already embedded or not applicable */ }
}

function openSmartObjectContents(lyr) {
    if (!lyr || lyr.kind !== LayerKind.SMARTOBJECT) {
        throw new Error("Selected layer is not a Smart Object.");
    }
    app.activeDocument.activeLayer = lyr;
    ensureEmbeddedSO();
    executeAction(stringIDToTypeID('placedLayerEditContents'), new ActionDescriptor(), DialogModes.NO);
    // activeDocument is now the SO's PSB document
}

function fitActiveLayerToCanvasTopLeft(doc) {
    var lyr = doc.activeLayer;

    // current layer bounds
    var b = lyr.bounds;
    var l = px(b[0]), t = px(b[1]), r = px(b[2]), btm = px(b[3]);
    var lw = r - l, lh = btm - t;

    // canvas size
    var cw = doc.width.as("px");
    var ch = doc.height.as("px");

    if (lw > 0 && lh > 0) {
        // non-uniform to fill canvas exactly; anchor top-left
        var sx = (cw / lw) * 100;
        var sy = (ch / lh) * 100;
        lyr.resize(sx, sy, AnchorPosition.TOPLEFT);
    }

    // snap top-left to (0,0)
    b = lyr.bounds; l = px(b[0]); t = px(b[1]);
    if (l !== 0 || t !== 0) lyr.translate(-l, -t);
}

function editSOAndFillWithFile(soLayer, file) {
    // Opens SO PSB, pastes the artwork, fits to canvas, saves & closes
    openSmartObjectContents(soLayer);       // -> inside PSB
    var soDoc = app.activeDocument;

    // paste the new design as a fresh layer
    openCopy(file);
    soDoc.paste();
    var pasted = soDoc.activeLayer;

    // remove any other layers so only pasted remains
    for (var i = soDoc.layers.length - 1; i >= 0; i--) {
        var L = soDoc.layers[i];
        if (L !== pasted) { try { L.remove(); } catch(e) {} }
    }

    // scale/align the pasted layer to fill PSB canvas exactly
    fitActiveLayerToCanvasTopLeft(soDoc);

    // save & close PSB (updates parent doc)
    soDoc.close(SaveOptions.SAVECHANGES);
}

function forEachImmediateLayer(layerSet, fn) {
    for (var i = 0; i < layerSet.layers.length; i++) fn(layerSet.layers[i], i);
}

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG;   // PNG-24
    o.PNG8 = false;
    o.transparency = true;
    o.interlaced = false;
    o.optimized = true;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

/* ----------------- main ----------------- */
(function main(){
    if (!app.documents.length) { alert("Open your PSD first."); return; }

    var inFolder = Folder.selectDialog("Select the folder of designs");
    if (!inFolder) { alert("No input folder selected."); return; }
    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found."); return; }

    var outFolder = Folder.selectDialog("Select the output folder for PNGs");
    if (!outFolder) { alert("No output folder selected."); return; }

    // Select your TEMPLATE group (with the two SO layers) before running
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE group and run again.");
        return;
    }

    // Collect the two Smart Object layers
    var soLayers = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) {
            soLayers.push(lyr);
        }
    });
    if (soLayers.length < 2) {
        alert("Template group must contain the two Smart Object layers (Normal 60% and Multiply 100%).");
        return;
    }

    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    for (var i = 0; i < files.length; i++) {
        var f = files[i]; if (!(f instanceof File)) continue;

        // Fill each SO with the design (keeps parent transform/effects identical)
        for (var s = 0; s < soLayers.length; s++) {
            editSOAndFillWithFile(soLayers[s], f);
        }

        // Export PNG
        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    app.preferences.rulerUnits = oldUnits;
    alert("✅ Done! Designs pasted into SO canvases — no placement drift. Exports saved to:\n" + outFolder.fsName);
})();
