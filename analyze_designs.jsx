#target photoshop
(function () {
  if (!app.documents.length) { alert("Open your PSD first."); return; }

  // Always work in pixels
  var oldUnits = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;

  var doc = app.activeDocument;

  // --- helpers ---
  function findTopGroupByName(name) {
    for (var i = 0; i < doc.layerSets.length; i++) {
      if (doc.layerSets[i].name === name) return doc.layerSets[i];
    }
    return null;
  }

  function boundsPx(layer) {
    var b = layer.bounds; // [L,T,R,B] UnitValues
    var L = b[0].as('px'), T = b[1].as('px'), R = b[2].as('px'), B = b[3].as('px');
    return {
      left: Math.round(L), top: Math.round(T),
      right: Math.round(R), bottom: Math.round(B),
      width: Math.round(R - L), height: Math.round(B - T),
      cx: Math.round(L + (R - L)/2), cy: Math.round(T + (B - T)/2)
    };
  }

  function tryGetRotationDeg(layer) {
    try {
      var ref = new ActionReference();
      ref.putProperty(charIDToTypeID('Prpr'), stringIDToTypeID('layerTransform'));
      ref.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
      var prev = doc.activeLayer;
      doc.activeLayer = layer;

      var desc = executeActionGet(ref);
      doc.activeLayer = prev;

      if (desc.hasKey(stringIDToTypeID('layerTransform'))) {
        var t = desc.getObjectValue(stringIDToTypeID('layerTransform'));
        var xx = t.getDouble(stringIDToTypeID('xx')); 
        var xy = t.getDouble(stringIDToTypeID('xy'));
        var ang = Math.atan2(xy, xx) * 180 / Math.PI;
        if (ang > 180) ang -= 360;
        if (ang < -180) ang += 360;
        return ang.toFixed(2);
      }
    } catch (e) {}
    return "";
  }

  function csvEscape(s) {
    s = String(s);
    if (s.indexOf('"') !== -1 || s.indexOf(',') !== -1 || s.indexOf('\n') !== -1) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // --- locate the "Designs" root ---
  var designsRoot = findTopGroupByName("Designs");
  if (!designsRoot) { alert('Could not find a top-level group named "Designs".'); return; }

  // Prepare CSV output
  var out = [];
  out.push([
    "group_name",
    "layer_name",
    "layer_kind",
    "visible",
    "blend_mode",
    "opacity",
    "left_px","top_px","right_px","bottom_px",
    "width_px","height_px","center_x_px","center_y_px",
    "rotation_deg"
  ].join(","));

  // Iterate each sub-group beginning with DES_
  for (var gi = 0; gi < designsRoot.layerSets.length; gi++) {
    var g = designsRoot.layerSets[gi];
    if (g.name.toLowerCase().indexOf("des_") !== 0) continue;

    for (var li = 0; li < g.artLayers.length; li++) {
      var lyr = g.artLayers[li];
      var kindStr = (lyr.kind === LayerKind.SMARTOBJECT) ? "SMARTOBJECT" :
                    (lyr.kind === LayerKind.NORMAL) ? "PIXEL" :
                    (lyr.kind === LayerKind.TEXT) ? "TEXT" : "OTHER";

      var b = boundsPx(lyr);
      var rot = tryGetRotationDeg(lyr);

      out.push([
        csvEscape(g.name),
        csvEscape(lyr.name),
        csvEscape(kindStr),
        lyr.visible ? "1" : "0",
        csvEscape(lyr.blendMode.toString().replace(/^BlendMode\./,'')),
        Math.round(lyr.opacity),

        b.left, b.top, b.right, b.bottom,
        b.width, b.height, b.cx, b.cy,
        rot
      ].join(","));
    }

    // Nested layer sets (if any)
    for (var si = 0; si < g.layerSets.length; si++) {
      var sg = g.layerSets[si];
      for (var li2 = 0; li2 < sg.artLayers.length; li2++) {
        var lyr2 = sg.artLayers[li2];
        var kindStr2 = (lyr2.kind === LayerKind.SMARTOBJECT) ? "SMARTOBJECT" :
                       (lyr2.kind === LayerKind.NORMAL) ? "PIXEL" :
                       (lyr2.kind === LayerKind.TEXT) ? "TEXT" : "OTHER";
        var b2 = boundsPx(lyr2);
        var rot2 = tryGetRotationDeg(lyr2);
        out.push([
          csvEscape(g.name + "/" + sg.name),
          csvEscape(lyr2.name),
          csvEscape(kindStr2),
          lyr2.visible ? "1" : "0",
          csvEscape(lyr2.blendMode.toString().replace(/^BlendMode\./,'')),
          Math.round(lyr2.opacity),

          b2.left, b2.top, b2.right, b2.bottom,
          b2.width, b2.height, b2.cx, b2.cy,
          rot2
        ].join(","));
      }
    }
  }

  // Determine script directory
  var scriptFile = new File($.fileName);
  var scriptFolder = scriptFile.parent;
  var csvFile = new File(scriptFolder + "/design_measurements.csv");

  // Write CSV to same folder
  csvFile.encoding = "UTF8";
  csvFile.open("w");
  csvFile.write(out.join("\n"));
  csvFile.close();

  app.preferences.rulerUnits = oldUnits;

  alert("Analysis complete.\nSaved: " + csvFile.fsName + "\nRows: " + (out.length - 1));
})();
