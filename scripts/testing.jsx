#target photoshop
app.bringToFront();

function replaceContents(absPath) {
    var d = new ActionDescriptor();
    d.putPath(charIDToTypeID("null"), new File(absPath));
    d.putInteger(stringIDToTypeID("pageNumber"), 1);
    executeAction(stringIDToTypeID("placedLayerReplaceContents"), d, DialogModes.NO);
}

// Bounds helper (returns {l,t,r,b,w,h,cx,cy} in pixels)
function getBoundsPx(lyr) {
    var b = lyr.bounds; // [l,t,r,b] UnitValues
    function v(u){ return u.as("px"); }
    var l=v(b[0]), t=v(b[1]), r=v(b[2]), btm=v(b[3]);
    return { l:l, t:t, r:r, b:btm, w:r-l, h:btm-t, cx:(l+r)/2, cy:(t+btm)/2 };
}

// Force layer to match target bounds (size + position)
function normalizeToBounds(lyr, target) {
    // Work in pixels
    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    app.activeDocument.activeLayer = lyr;
    var cur = getBoundsPx(lyr);

    // Scale to match width/height
    if (cur.w > 0 && cur.h > 0) {
        var sx = (target.w / cur.w) * 100;
        var sy = (target.h / cur.h) * 100;
        lyr.resize(sx, sy, AnchorPosition.MIDDLECENTER); // scale about center
    }

    // Recompute after resize, then move to target center
    cur = getBoundsPx(lyr);
    var dx = target.cx - cur.cx;
    var dy = target.cy - cur.cy;
    lyr.translate(dx, dy);

    app.preferences.rulerUnits = oldUnits;
}

function forEachImmediateLayer(layerSet, fn) {
    for (var i = 0; i < layerSet.layers.length; i++) fn(layerSet.layers[i], i);
}

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG; // PNG-24
    o.PNG8 = false; o.transparency = true; o.interlaced = false; o.optimized = true;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

function main(){
    if (!app.documents.length) { alert("Open your PSD first."); return; }

    // Pick input & output folders
    var inFolder = Folder.selectDialog("Select the folder of designs");
    if (!inFolder) { alert("No input folder selected."); return; }
    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found."); return; }

    var outFolder = Folder.selectDialog("Select the output folder for PNGs");
    if (!outFolder) { alert("No output folder selected."); return; }

    // The selected layer must be your TEMPLATE group with the two SO layers
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE group (two Smart Object layers) and run again.");
        return;
    }

    // Collect the two Smart Object layers and record their target bounds once
    var soLayers = [];
    var targets = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) {
            soLayers.push(lyr);
            targets.push(getBoundsPx(lyr)); // snapshot exact placement/size now
        }
    });
    if (soLayers.length < 2) {
        alert("Template group must contain the two Smart Object layers (Normal 60%, Multiply 100%).");
        return;
    }

    // Iterate: replace both SOs -> normalize bounds -> export -> next
    for (var i=0; i<files.length; i++) {
        var f = files[i]; if (!(f instanceof File)) continue;

        for (var s=0; s<soLayers.length; s++) {
            var lyr = soLayers[s];
            app.activeDocument.activeLayer = lyr;
            replaceContents(f.fsName);        // swap art, keeps transform matrix
            normalizeToBounds(lyr, targets[s]); // force back to exact size/position
        }

        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    alert("✅ Done! Exported " + files.length + " PNGs to: " + outFolder.fsName);
}

try { main(); } catch (e) { alert("Error: " + e.message); }
