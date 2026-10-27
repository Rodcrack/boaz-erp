// Reemplaza el envío "de mentira" del formulario Cotizar ahora por uno real.
// Se carga al final de index.html: <script src="/boaz-cotizar.js?v=1"></script>
(function () {
  var cargadoEn = Date.now();
  window.submitForm = function () {
    var valid = true;
    var fields = [
      { id: 'fg-nombre',   input: 'inp-nombre',   check: function (v) { return v.trim().length > 1; } },
      { id: 'fg-empresa',  input: 'inp-empresa',  check: function (v) { return v.trim().length > 1; } },
      { id: 'fg-email',    input: 'inp-email',    check: function (v) { return /\S+@\S+\.\S+/.test(v); } },
      { id: 'fg-wa',       input: 'inp-wa',       check: function (v) { return v.trim().length > 7; } },
      { id: 'fg-servicio', input: 'inp-servicio', check: function (v) { return v !== ''; } }
    ];
    fields.forEach(function (f) {
      var fg = document.getElementById(f.id);
      var val = document.getElementById(f.input).value;
      if (!f.check(val)) { fg.classList.add('has-error'); valid = false; }
      else { fg.classList.remove('has-error'); }
    });
    if (!valid) return;

    var btn = document.querySelector('#formContent .form-submit');
    var aviso = document.getElementById('cotizError');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'cotizError';
      aviso.style.cssText = 'display:none;margin-top:12px;padding:10px 14px;border-radius:8px;background:#FEF2F2;color:#B91C1C;font-size:14px;line-height:1.4;';
      btn.parentNode.insertBefore(aviso, btn.nextSibling);
    }
    aviso.style.display = 'none';
    var textoBtn = btn.textContent;
    btn.disabled = true; btn.textContent = 'Enviando…';

    var v = function (id) { return document.getElementById(id).value; };
    var datos = {
      nombre: v('inp-nombre'), empresa: v('inp-empresa'), email: v('inp-email'),
      whatsapp: v('inp-wa'), servicio: v('inp-servicio'), volumen: v('inp-volumen'),
      mensaje: v('inp-msg'),
      web: '' // campo trampa anti-spam
    };
    if (Date.now() - cargadoEn < 2500) datos.web = 'bot';

    fetch('/enviar-cotizacion.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (res && res.ok) {
          document.getElementById('formContent').style.display = 'none';
          document.getElementById('successMsg').style.display = 'block';
          setTimeout(function () { if (typeof closeModal === 'function') closeModal(); }, 3500);
        } else {
          throw new Error('fallo');
        }
      })
      .catch(function () {
        aviso.innerHTML = 'No pudimos enviar tu solicitud. Por favor escríbenos por WhatsApp: ' +
          '<a href="https://wa.me/51960622471" style="color:#B91C1C;font-weight:700">+51 960 622 471</a>';
        aviso.style.display = 'block';
        btn.disabled = false; btn.textContent = textoBtn;
      });
  };
})();
