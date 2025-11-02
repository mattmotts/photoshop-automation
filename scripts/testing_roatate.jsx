#target photoshop
app.bringToFront();

function px(u){ return u.as("px"); }

function openCopy(file) {
    var doc = app.open(file);
    doc.selection.selectAll();
    doc.selection.copy();
    doc.close(SaveOptions.DONOTSAVECHANGES);
}

function fitActiveLayerToCanvasTopLeft(doc) {
    var lyr = doc.activeLayer;

    // measure layer bounds in px
    var b = lyr.bounds;
    var l = px(b[0]), t = px(b[1]), r = px(b[2]), btm = px(b[3]);
    var lw = r - l, lh = btm - t;

    // measure canvas in px
    var cw = doc.width.as("px");
    var ch = doc.height.as("px");

    // non-uniform scale to match canvas exactly, anchored at top-left
    if (lw > 0 && lh > 0) {
        var sx = (cw / lw) * 100;
        var sy = (ch / lh) * 100;
        lyr.resize(sx, sy, AnchorPosition.TOPLEFT);
    }

    // re-read and snap top-left to (0,0)
    b = lyr.bounds; l = px(b[0]); t = px(b[1]);
    if (l !== 0 || t !== 0) lyr.translate(-l, -t);
}

function editSOAndFillWithFile(soLayer, file) {
    // select SO and open its PSB
    app.activeDocument.activeLayer = soLayer;
    soLayer.editContents();            // now we're inside the SO/PSB doc

    var soDoc = app.activeDocument;
    // remove existing content (keep at least one layer active)
    while (soDoc.layers.length > 1) {
        soDoc.layers[0].remove();
    }
    // clear the remaining layer contents
    try { soDoc.activeLayer.remove(); } catch(e) {}

    // paste the new design
    openCopy(file);                    // copies from source and closes it
    soDoc.paste();                     // pasted layer is now active

    // scale to the SO canvas exactly and align top-left
    fitActiveLayerToCanvasTopLeft(soDoc);

    // save & close SO, applying change to the parent document
    soDoc.close(SaveOptions.SAVECHANGES);
}

function getBoundsPx(lyr) {
    var b = lyr.bounds;
    return { l:px(b[0]), t:px(b[1]), r:px(b[2]), b:px(b[3]),
             w:px(b[2]) - px(b[0]), h:px(b[3]) - px(b[1]) };
}

function forEachImmediateLayer(layerSet, fn) {
    for (var i = 0; i < layerSet.layers.length; i++) fn(layerSet.layers[i], i);
}

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG;
    o.PNG8 = false;
    o.transparency = true;
    o.interlaced = false;
    o.optimized = true;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

(function main(){
    if (!app.documents.length) { alert("Open your PSD first."); return; }

    var inFolder = Folder.selectDialog("Select the folder of designs");
    if (!inFolder) { alert("No input folder selected."); return; }
    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found."); return; }

    var outFolder = Folder.selectDialog("Select the output folder for PNGs");
    if (!outFolder) { alert("No output folder selected."); return; }

    // Select your TEMPLATE group (two Smart Object layers) before running
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE group and run again.");
        return;
    }

    // Collect the two SO layers in the group
    var soLayers = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) {
            soLayers.push(lyr);
        }
    });
    if (soLayers.length < 2) {
        alert("Template group must contain the two Smart Object layers (Normal & Multiply).");
        return;
    }

    // Process each design
    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    for (var i=0; i<files.length; i++) {
        var f = files[i]; if (!(f instanceof File)) continue;

        // Fill each SO with the design (no transform change in parent)
        for (var s=0; s<soLayers.length; s++) {
            editSOAndFillWithFile(soLayers[s], f);
        }

        // Export the result
        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    app.preferences.rulerUnits = oldUnits;
    alert("✅ Done! No drift: designs are pasted into each Smart Object canvas exactly.");
})();
