/* Preview behaviour only (not shipped): menu sheet, Suggest a Change drawer, Form/Chat, Send to Triage. */
(function () {
  var q = new URLSearchParams(location.search);
  var sheet = document.getElementById("sheet");
  var sheetScrim = document.querySelector(".sheet-scrim");
  function menu(open) { if (!sheet) return; sheet.hidden = !open; sheetScrim.hidden = !open; }
  document.querySelectorAll("[data-menu]").forEach(function (b) { b.addEventListener("click", function () { menu(sheet.hidden); }); });
  if (q.get("menu") === "open") menu(true);

  var drawer = document.getElementById("drawer");
  if (!drawer) return;
  var scrim = document.querySelector(".scrim");
  var rows = {};
  fetch("js/rows.json").then(function (r) { return r.json(); }).then(function (j) { rows = j; }).catch(function () {});
  function view(sent) {
    document.getElementById("form").hidden = sent; document.getElementById("sent").hidden = !sent;
    document.getElementById("foot-form").hidden = sent; document.getElementById("foot-sent").hidden = !sent;
  }
  function mode(m) {
    drawer.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    drawer.querySelectorAll("[data-pane]").forEach(function (p) { p.hidden = p.dataset.pane !== m; });
  }
  function open(id) {
    if (rows[id]) {
      drawer.querySelectorAll("[data-ref-id]").forEach(function (n) { n.textContent = id; });
      drawer.querySelector("[data-ref-req]").textContent = rows[id].req;
    }
    document.querySelectorAll(".row.is-target").forEach(function (r) { r.classList.remove("is-target"); });
    var row = document.getElementById("row-" + id);
    if (row) { row.classList.add("is-target"); row.scrollIntoView({ block: "center", behavior: "instant" }); }
    drawer.hidden = false; scrim.hidden = false; view(false);
  }
  function close() { drawer.hidden = true; scrim.hidden = true; }
  document.querySelectorAll("[data-suggest]").forEach(function (b) { b.addEventListener("click", function () { open(b.dataset.suggest); }); });
  drawer.querySelectorAll("[data-mode]").forEach(function (b) { b.addEventListener("click", function () { mode(b.dataset.mode); }); });
  document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
  drawer.querySelector("[data-send]").addEventListener("click", function () { view(true); });
  var auto = document.body.dataset.openDrawer || q.get("drawer");
  if (auto) {
    open(auto);
    if (q.get("mode") === "chat") mode("chat");
    if (q.get("state") === "sent") view(true);
  }
})();
