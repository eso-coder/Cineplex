/* ═══════════════════════════════════════════════════════
   CINEPLEX — Auth Modal controller
   Renders a single modal, opened from the navbar login/register
   buttons (intercepted site-wide) or via AuthModal.open(tab).
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var COUNTRIES = [
    { c: 'US', f: '🇺🇸', d: '+1', n: 'United States' },
    { c: 'GB', f: '🇬🇧', d: '+44', n: 'United Kingdom' },
    { c: 'UZ', f: '🇺🇿', d: '+998', n: 'Uzbekistan' },
    { c: 'CA', f: '🇨🇦', d: '+1', n: 'Canada' },
    { c: 'AU', f: '🇦🇺', d: '+61', n: 'Australia' },
    { c: 'DE', f: '🇩🇪', d: '+49', n: 'Germany' },
    { c: 'FR', f: '🇫🇷', d: '+33', n: 'France' },
    { c: 'IN', f: '🇮🇳', d: '+91', n: 'India' },
    { c: 'RU', f: '🇷🇺', d: '+7', n: 'Russia' },
    { c: 'TR', f: '🇹🇷', d: '+90', n: 'Türkiye' },
    { c: 'JP', f: '🇯🇵', d: '+81', n: 'Japan' },
    { c: 'BR', f: '🇧🇷', d: '+55', n: 'Brazil' },
  ];

  var ICONS = {
    mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
    google: '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>',
    apple: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 12.54c-.02-2.05 1.68-3.03 1.75-3.08-.95-1.39-2.43-1.58-2.96-1.6-1.26-.13-2.46.74-3.1.74-.64 0-1.62-.72-2.66-.7-1.37.02-2.63.8-3.34 2.02-1.42 2.47-.36 6.12 1.02 8.13.67.98 1.48 2.09 2.53 2.05 1.02-.04 1.4-.66 2.64-.66 1.23 0 1.58.66 2.66.64 1.1-.02 1.79-1 2.46-1.99.78-1.14 1.1-2.24 1.12-2.3-.02-.01-2.15-.83-2.17-3.27zM15.1 6.21c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.98 1.56-.85 2.48.9.07 1.83-.46 2.39-1.13z"/></svg>',
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m15 18-6-6 6-6"/></svg>',
  };

  var state = {
    tab: 'signup',
    country: COUNTRIES[0],
    pendingEmail: '',
    resendTimer: null,
  };
  var el = null; // root overlay element

  /* ── Build DOM once ── */
  function build() {
    if (el) return el;
    var overlay = document.createElement('div');
    overlay.className = 'am-overlay';
    overlay.id = 'auth-modal';
    overlay.innerHTML = [
      '<div class="am-card" role="dialog" aria-modal="true" aria-label="Account">',
      '  <button class="am-close" type="button" aria-label="Close">' + ICONS.close + '</button>',

      '  <div class="am-toggle" id="am-toggle">',
      '    <button class="am-toggle-btn active" data-tab="signup" type="button">Sign up</button>',
      '    <button class="am-toggle-btn" data-tab="signin" type="button">Sign in</button>',
      '  </div>',

      '  <div class="am-error" id="am-error"></div>',

      /* ── SIGN UP ── */
      '  <div class="am-panel active" id="am-panel-signup">',
      '    <div class="am-title">Create an account</div>',
      '    <div class="am-row">',
      '      <div class="am-field"><input class="am-input" id="am-first" type="text" placeholder="First name" autocomplete="given-name"></div>',
      '      <div class="am-field"><input class="am-input" id="am-last" type="text" placeholder="Last name" autocomplete="family-name"></div>',
      '    </div>',
      '    <div class="am-field"><span class="am-field-icon">' + ICONS.mail + '</span>',
      '      <input class="am-input has-icon" id="am-email" type="email" placeholder="Enter your email" autocomplete="email"></div>',
      '    <div class="am-field"><span class="am-field-icon">' + ICONS.lock + '</span>',
      '      <input class="am-input has-icon" id="am-pass" type="password" placeholder="Create a password (min 6 chars)" autocomplete="new-password"></div>',
      '    <div class="am-field"><div class="am-phone">',
      '      <button class="am-cc" id="am-cc" type="button"><span class="am-flag">🇺🇸</span><span id="am-cc-dial">+1</span>' + ICONS.chevron + '',
      '        <div class="am-cc-menu" id="am-cc-menu"></div>',
      '      </button>',
      '      <input id="am-phone" type="tel" placeholder="(775) 351-6501" autocomplete="tel">',
      '    </div></div>',
      '    <button class="am-btn" id="am-signup-btn" type="button">Create an account</button>',
      '    <div class="am-divider">OR SIGN IN WITH</div>',
      '    <div class="am-social-row">',
      '      <button class="am-social" data-provider="google" type="button" aria-label="Continue with Google">' + ICONS.google + '</button>',
      '      <button class="am-social" data-provider="apple" type="button" aria-label="Continue with Apple">' + ICONS.apple + '</button>',
      '    </div>',
      '    <div class="am-footer">By creating an account, you agree to our <a href="#">Terms &amp; Service</a></div>',
      '  </div>',

      /* ── SIGN IN ── */
      '  <div class="am-panel" id="am-panel-signin">',
      '    <div class="am-title">Welcome back</div>',
      '    <div class="am-field"><span class="am-field-icon">' + ICONS.mail + '</span>',
      '      <input class="am-input has-icon" id="am-si-email" type="email" placeholder="Enter your email" autocomplete="email"></div>',
      '    <div class="am-field"><span class="am-field-icon">' + ICONS.lock + '</span>',
      '      <input class="am-input has-icon" id="am-si-pass" type="password" placeholder="Password" autocomplete="current-password"></div>',
      '    <button class="am-btn" id="am-signin-btn" type="button">Sign in</button>',
      '    <div class="am-divider">OR SIGN IN WITH</div>',
      '    <div class="am-social-row">',
      '      <button class="am-social" data-provider="google" type="button" aria-label="Continue with Google">' + ICONS.google + '</button>',
      '      <button class="am-social" data-provider="apple" type="button" aria-label="Continue with Apple">' + ICONS.apple + '</button>',
      '    </div>',
      '  </div>',

      /* ── OTP ── */
      '  <div class="am-panel" id="am-panel-otp">',
      '    <button class="am-back" id="am-otp-back" type="button">' + ICONS.back + ' Back</button>',
      '    <div class="am-title sm">Verify your email</div>',
      '    <div class="am-sub">We sent a 6-digit code to <b id="am-otp-email"></b>. Enter it below.</div>',
      '    <div class="am-otp" id="am-otp-inputs">' +
        [0,1,2,3,4,5].map(function(){return '<input type="text" inputmode="numeric" maxlength="1">';}).join('') +
      '    </div>',
      '    <div class="am-hint" id="am-otp-dev"></div>',
      '    <button class="am-btn" id="am-verify-btn" type="button" style="margin-top:16px">Confirm code</button>',
      '    <div class="am-hint">Did\'t get it? <button class="am-link-btn" id="am-resend" type="button">Resend code</button></div>',
      '  </div>',

      '</div>',
    ].join('\n');

    document.body.appendChild(overlay);
    el = overlay;
    wire();
    return overlay;
  }

  /* ── Helpers ── */
  function $(id) { return el.querySelector(id); }
  function showError(msg) {
    var e = $('#am-error');
    e.textContent = msg;
    e.classList.add('show');
  }
  function clearError() { $('#am-error').classList.remove('show'); }

  function setTab(tab) {
    state.tab = tab;
    clearError();
    el.querySelectorAll('.am-toggle-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    showPanel(tab); // 'signup' | 'signin'
    el.querySelector('#am-toggle').style.display = (tab === 'otp') ? 'none' : '';
  }

  function showPanel(name) {
    ['signup', 'signin', 'otp'].forEach(function (p) {
      var node = $('#am-panel-' + p);
      if (node) node.classList.toggle('active', p === name);
    });
    el.querySelector('#am-toggle').style.display = (name === 'otp') ? 'none' : '';
  }

  function setLoading(btn, loading, label) {
    if (loading) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || 'Please wait…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  function redirectToProfile() {
    if (typeof App !== 'undefined' && App.refreshNavbarUser) App.refreshNavbarUser();
    window.location.href = '/pages/profile.html';
  }

  /* ── Country dropdown ── */
  function buildCountryMenu() {
    var menu = $('#am-cc-menu');
    menu.innerHTML = COUNTRIES.map(function (c) {
      return '<button class="am-cc-opt" type="button" data-cc="' + c.c + '">' +
        '<span class="am-flag" style="font-size:18px">' + c.f + '</span><span>' + c.n + '</span>' +
        '<span class="am-dial">' + c.d + '</span></button>';
    }).join('');
    menu.querySelectorAll('.am-cc-opt').forEach(function (opt) {
      opt.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var c = COUNTRIES.find(function (x) { return x.c === opt.dataset.cc; });
        state.country = c;
        $('#am-cc').querySelector('.am-flag').textContent = c.f;
        $('#am-cc-dial').textContent = c.d;
        menu.classList.remove('open');
      });
    });
  }

  /* ── Wire events (once) ── */
  function wire() {
    buildCountryMenu();

    $('.am-close') && el.querySelector('.am-close').addEventListener('click', close);
    el.addEventListener('mousedown', function (ev) { if (ev.target === el) close(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && el.classList.contains('open')) close();
    });

    el.querySelector('#am-toggle').addEventListener('click', function (ev) {
      var b = ev.target.closest('.am-toggle-btn');
      if (b) setTab(b.dataset.tab);
    });

    // Country selector toggle
    $('#am-cc').addEventListener('click', function (ev) {
      ev.stopPropagation();
      $('#am-cc-menu').classList.toggle('open');
    });
    document.addEventListener('click', function () {
      var m = el && el.querySelector('#am-cc-menu');
      if (m) m.classList.remove('open');
    });

    // Signup
    $('#am-signup-btn').addEventListener('click', doSignup);
    $('#am-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignup(); });
    $('#am-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignup(); });

    // Signin
    $('#am-signin-btn').addEventListener('click', doSignin);
    $('#am-si-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignin(); });

    // OTP
    wireOtpInputs();
    $('#am-verify-btn').addEventListener('click', doVerify);
    $('#am-otp-back').addEventListener('click', function () { setTab('signup'); });
    $('#am-resend').addEventListener('click', doResend);

    // Social
    el.querySelectorAll('.am-social').forEach(function (b) {
      b.addEventListener('click', function () { doOAuth(b.dataset.provider); });
    });
  }

  /* ── OTP input behaviour ── */
  function wireOtpInputs() {
    var inputs = Array.prototype.slice.call(el.querySelectorAll('#am-otp-inputs input'));
    inputs.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
        if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
        if (e.key === 'Enter') doVerify();
      });
      inp.addEventListener('paste', function (e) {
        e.preventDefault();
        var digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
        digits.forEach(function (d, k) { if (inputs[k]) inputs[k].value = d; });
        (inputs[Math.min(digits.length, 5)] || inputs[5]).focus();
      });
    });
  }
  function otpValue() {
    return Array.prototype.map.call(el.querySelectorAll('#am-otp-inputs input'), function (i) { return i.value; }).join('');
  }
  function clearOtp() {
    el.querySelectorAll('#am-otp-inputs input').forEach(function (i) { i.value = ''; });
  }

  /* ── Actions ── */
  function ensureApi() {
    if (typeof AuthAPI === 'undefined') {
      showError('Auth service is unavailable. Make sure the backend is running.');
      return false;
    }
    return true;
  }

  function doSignup() {
    clearError();
    if (!ensureApi()) return;
    var firstName = $('#am-first').value.trim();
    var lastName = $('#am-last').value.trim();
    var email = $('#am-email').value.trim();
    var password = $('#am-pass').value;
    var phoneLocal = $('#am-phone').value.trim();
    if (!firstName) return showError('Please enter your first name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Please enter a valid email address.');
    if (!password || password.length < 6) return showError('Password must be at least 6 characters.');

    var phone = phoneLocal ? (state.country.d + ' ' + phoneLocal) : '';
    var btn = $('#am-signup-btn');
    setLoading(btn, true, 'Sending code…');
    AuthAPI.signup({ firstName: firstName, lastName: lastName, email: email, phone: phone, password: password })
      .then(function (data) {
        state.pendingEmail = email;
        goToOtp(email, data && data.devCode);
      })
      .catch(function (err) { showError(err.message || 'Could not start signup.'); })
      .finally(function () { setLoading(btn, false); });
  }

  function goToOtp(email, devCode) {
    $('#am-otp-email').textContent = email;
    clearOtp();
    var dev = $('#am-otp-dev');
    if (devCode) {
      dev.innerHTML = 'Dev mode — your code is <span class="am-dev">' + devCode + '</span>';
      // Prefill for convenience in dev/stub mode
      var inputs = el.querySelectorAll('#am-otp-inputs input');
      String(devCode).split('').forEach(function (d, k) { if (inputs[k]) inputs[k].value = d; });
    } else {
      dev.textContent = '';
    }
    showPanel('otp');
    startResendCooldown();
    setTimeout(function () { var f = el.querySelector('#am-otp-inputs input'); if (f) f.focus(); }, 60);
  }

  function doVerify() {
    clearError();
    if (!ensureApi()) return;
    var code = otpValue();
    if (code.length !== 6) return showError('Enter the 6-digit code.');
    var btn = $('#am-verify-btn');
    setLoading(btn, true, 'Verifying…');
    AuthAPI.verifyOtp(state.pendingEmail, code)
      .then(function () { close(); redirectToProfile(); })
      .catch(function (err) { showError(err.message || 'Verification failed.'); setLoading(btn, false); });
  }

  function doResend() {
    clearError();
    if (!ensureApi()) return;
    var btn = $('#am-resend');
    btn.disabled = true;
    AuthAPI.resendOtp(state.pendingEmail)
      .then(function (data) {
        if (data && data.devCode) {
          $('#am-otp-dev').innerHTML = 'Dev mode — your code is <span class="am-dev">' + data.devCode + '</span>';
        }
        startResendCooldown();
      })
      .catch(function (err) { showError(err.message || 'Could not resend.'); btn.disabled = false; });
  }

  function startResendCooldown() {
    var btn = $('#am-resend');
    var left = 60;
    clearInterval(state.resendTimer);
    btn.disabled = true;
    btn.textContent = 'Resend in ' + left + 's';
    state.resendTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(state.resendTimer);
        btn.disabled = false;
        btn.textContent = 'Resend code';
      } else {
        btn.textContent = 'Resend in ' + left + 's';
      }
    }, 1000);
  }

  function doSignin() {
    clearError();
    if (!ensureApi()) return;
    var email = $('#am-si-email').value.trim();
    var pass = $('#am-si-pass').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Please enter a valid email address.');
    if (!pass) return showError('Please enter your password.');
    var btn = $('#am-signin-btn');
    setLoading(btn, true, 'Signing in…');
    AuthAPI.signin(email, pass)
      .then(function () { close(); redirectToProfile(); })
      .catch(function (err) {
        setLoading(btn, false);
        // Unverified email — resend OTP and show verification panel
        var needsVerify = err.status === 403 &&
          err.data && err.data.error && err.data.error.details &&
          err.data.error.details.needsVerification;
        if (needsVerify) {
          state.pendingEmail = email;
          AuthAPI.resendOtp(email)
            .then(function (data) { goToOtp(email, data && data.devCode); })
            .catch(function () { goToOtp(email, null); });
          return;
        }
        showError(err.message || 'Sign in failed.');
      });
  }

  /* ── Real OAuth (Google Identity Services + Sign in with Apple) ───────────── */
  var oauthCfg = null, gisInited = false, appleInited = false, oauthPrep = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  // Config'ni bir marta olib, yoqilgan providerlar SDK'sini yuklab/initsiyalaymiz
  function prepareOAuth() {
    if (oauthPrep) return oauthPrep;
    // AuthAPI hali yuklanmagan bo'lsa — memoize qilmaymiz, keyin qayta urinamiz
    if (!(window.AuthAPI && AuthAPI.oauthConfig)) return Promise.resolve();
    oauthPrep = AuthAPI.oauthConfig().then(function (cfg) {
      oauthCfg = cfg || {};
      var tasks = [];
      if (cfg && cfg.google && cfg.google.enabled) {
        tasks.push(loadScript('https://accounts.google.com/gsi/client').then(function () {
          if (window.google && !gisInited) {
            window.google.accounts.id.initialize({ client_id: cfg.google.clientId, callback: onGoogleCredential });
            gisInited = true;
          }
        }).catch(function () {}));
      }
      if (cfg && cfg.apple && cfg.apple.enabled) {
        tasks.push(loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js').then(function () {
          if (window.AppleID && !appleInited) {
            window.AppleID.auth.init({ clientId: cfg.apple.clientId, scope: 'name email', redirectURI: location.origin + '/', usePopup: true });
            appleInited = true;
          }
        }).catch(function () {}));
      }
      return Promise.all(tasks);
    }).catch(function () { /* config yo'q → stub rejimi qoladi */ });
    return oauthPrep;
  }

  // Google ID token kelganda → backendga yuboramiz (backend uni tekshiradi)
  function onGoogleCredential(resp) {
    if (!resp || !resp.credential) return;
    if (!ensureApi()) return;
    clearError();
    AuthAPI.google({ token: resp.credential })
      .then(function () { close(); redirectToProfile(); })
      .catch(function (err) { showError(err.message || 'Google orqali kirishda xato.'); });
  }

  // Custom Google tugmasini rasmiy GIS tugmasi bilan almashtiramiz (ishonchli oqim)
  function renderGoogleButtons() {
    if (!gisInited || !window.google || !el) return;
    el.querySelectorAll('.am-social[data-provider="google"]').forEach(function (btn) {
      if (btn.dataset.gisDone) return;
      btn.dataset.gisDone = '1';
      var holder = document.createElement('div');
      holder.className = 'am-social am-gsi';
      holder.style.padding = '0';
      holder.style.background = 'transparent';
      holder.style.border = 'none';
      holder.style.overflow = 'hidden';
      btn.parentNode.replaceChild(holder, btn);
      try {
        window.google.accounts.id.renderButton(holder, {
          type: 'icon', shape: 'square', theme: 'filled_black', size: 'large',
        });
      } catch (e) { /* ignore */ }
    });
  }

  // Sign in with Apple — popup orqali id_token olamiz
  function appleSignIn() {
    if (!appleInited || !window.AppleID) return doStubOAuth('apple');
    if (!ensureApi()) return;
    clearError();
    window.AppleID.auth.signIn().then(function (data) {
      var idToken = data && data.authorization && data.authorization.id_token;
      if (!idToken) return showError('Apple orqali kirishda xato.');
      var nm = (data.user && data.user.name) || {};
      AuthAPI.apple({ credential: idToken, firstName: nm.firstName || '', lastName: nm.lastName || '' })
        .then(function () { close(); redirectToProfile(); })
        .catch(function (err) { showError(err.message || 'Apple orqali kirishda xato.'); });
    }).catch(function () { /* foydalanuvchi bekor qildi */ });
  }

  function doOAuth(provider) {
    // Provider yoqilgan bo'lsa — haqiqiy oqim, aks holda stub
    if (provider === 'apple' && appleInited) return appleSignIn();
    if (provider === 'google' && gisInited) {
      if (window.google) window.google.accounts.id.prompt();
      return;
    }
    return doStubOAuth(provider);
  }

  // Stub rejim: SDK sozlanmagan bo'lsa, test uchun email so'raymiz
  function doStubOAuth(provider) {
    clearError();
    if (!ensureApi()) return;
    var typed = (state.tab === 'signin' ? $('#am-si-email').value : $('#am-email').value).trim();
    var email = typed || window.prompt('Stub ' + provider + ' sign-in — enter an email to continue:');
    if (!email) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Please enter a valid email address.');
    var firstName = $('#am-first') ? $('#am-first').value.trim() : '';
    var lastName = $('#am-last') ? $('#am-last').value.trim() : '';
    var fn = provider === 'google' ? AuthAPI.google : AuthAPI.apple;
    fn({ email: email, firstName: firstName, lastName: lastName })
      .then(function () { close(); redirectToProfile(); })
      .catch(function (err) { showError(err.message || (provider + ' sign-in failed.')); });
  }

  /* ── Public open/close ── */
  function open(tab) {
    build();
    // Yoqilgan OAuth providerlarini tayyorlab, Google tugmasini render qilamiz
    prepareOAuth().then(renderGoogleButtons);
    renderGoogleButtons();
    setTab(tab === 'signin' ? 'signin' : 'signup');
    clearError();
    // Force a reflow so the closed-state styles commit, then transition open.
    // (Avoids requestAnimationFrame, which is throttled in hidden/background tabs.)
    void el.offsetWidth;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      var first = el.querySelector(state.tab === 'signin' ? '#am-si-email' : '#am-first');
      if (first) first.focus();
    }, 280);
  }
  function close() {
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
    clearInterval(state.resendTimer);
  }

  /* ── Intercept navbar login/register buttons site-wide ── */
  document.addEventListener('click', function (ev) {
    var trigger = ev.target.closest(
      '#nav-login-btn, #nav-register-btn, .mobile-auth-login, .mobile-auth-register, [data-auth-open]'
    );
    if (!trigger) return;
    // If already logged in, let normal navigation happen.
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) return;
    ev.preventDefault();
    var wantSignin = trigger.id === 'nav-login-btn' ||
      trigger.classList.contains('mobile-auth-login') ||
      trigger.getAttribute('data-auth-open') === 'signin';
    open(wantSignin ? 'signin' : 'signup');
  });

  window.AuthModal = { open: open, close: close };

  // OAuth SDK'larini oldindan yuklab qo'yamiz (modal ochilishidan oldin tayyor bo'lsin)
  if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
    try { prepareOAuth(); } catch (e) { /* ignore */ }
  }
})();
