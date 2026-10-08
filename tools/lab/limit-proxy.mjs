/* A real usage limit, on demand, for the lab's CLI.

   A pass-through to api.anthropic.com that can answer /v1/messages with the
   429 a usage limit produces - the unified rate-limit headers included - so
   what gets tested is the CLI's own handling of a refusal (its frames, its
   synthetic row, its result), not a frame typed into the panel. Nothing else
   is touched: every other request, and every request in pass mode, goes
   through with the lab's own credentials.

     node tools/lab/limit-proxy.mjs [port] [logfile]       default 8977, limit-proxy.log

   Point the lab's CLI at it (README: "A real usage limit"), then switch modes:

     GET /__mode?m=pass
     GET /__mode?m=limit&type=five_hour&reset=<epoch s>       every call refused
     GET /__mode?m=after&n=<k>&type=five_hour&reset=<epoch s> k more calls pass first
     ...&stay=1     keep refusing past the reset (a server running late)
     GET /__log     the request log so far

   Without stay, the proxy serves again from the reset on, as the server does. */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8977);
const logFile = process.argv[3] || 'limit-proxy.log';
let mode = { m: 'pass' };
const log = (line) => fs.appendFileSync(logFile, new Date().toISOString() + ' ' + line + '\n');

function limitHeaders() {
    const reset = String(mode.reset), five = mode.type === 'five_hour', week = mode.type === 'seven_day';
    return {
        'content-type': 'application/json',
        'request-id': 'req_lab_' + Date.now(),
        'anthropic-ratelimit-unified-status': 'rejected',
        'anthropic-ratelimit-unified-reset': reset,
        'anthropic-ratelimit-unified-representative-claim': mode.type,
        'anthropic-ratelimit-unified-overage-status': 'rejected',
        'anthropic-ratelimit-unified-overage-disabled-reason': 'out_of_credits',
        'anthropic-ratelimit-unified-5h-status': five ? 'rejected' : 'allowed',
        'anthropic-ratelimit-unified-5h-reset': reset,
        'anthropic-ratelimit-unified-5h-utilization': five ? '1.0' : '0.5',
        'anthropic-ratelimit-unified-7d-status': week ? 'rejected' : 'allowed',
        'anthropic-ratelimit-unified-7d-reset': reset,
        'anthropic-ratelimit-unified-7d-utilization': week ? '1.0' : '0.3'
    };
}

function refuse(req, res) {
    res.writeHead(429, limitHeaders());
    res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error',
        message: 'This request would exceed your account\'s rate limit. Please try again later.' } }));
    log('429 ' + req.method + ' ' + req.url + ' type=' + mode.type + ' reset=' + mode.reset);
}

function control(u, res) {
    if (u.pathname === '/__log') { res.end(fs.existsSync(logFile) ? fs.readFileSync(logFile) : ''); return; }
    mode = Object.fromEntries(u.searchParams);
    if (mode.n) mode.n = Number(mode.n);
    log('MODE ' + JSON.stringify(mode));
    res.end(JSON.stringify(mode));
}

/* 'after' counts down, then refuses; a refusal ends at its reset unless told to stay. */
function shouldRefuse() {
    if (mode.m === 'after') {
        if (mode.n > 0) mode.n--;
        else mode.m = 'limit';
    }
    if (mode.m === 'limit' && !mode.stay && Date.now() / 1000 >= Number(mode.reset)) {
        log('RESET reached - passing again');
        mode = { m: 'pass' };
    }
    return mode.m === 'limit';
}

function forward(req, res) {
    const headers = Object.assign({}, req.headers, { host: 'api.anthropic.com' });
    const up = https.request({ host: 'api.anthropic.com', port: 443, path: req.url, method: req.method, headers }, (r) => {
        log(r.statusCode + ' ' + req.method + ' ' + req.url + ' status=' + (r.headers['anthropic-ratelimit-unified-status'] || '-'));
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
    });
    up.on('error', (e) => { log('ERR ' + req.url + ' ' + e.message); res.writeHead(502); res.end(); });
    req.pipe(up);
}

http.createServer((req, res) => {
    const u = new URL(req.url, 'http://lab');
    if (u.pathname === '/__mode' || u.pathname === '/__log') return control(u, res);
    const messages = req.method === 'POST' && /^[/]v1[/]messages([?]|$)/.test(req.url);
    if (messages && shouldRefuse()) {
        req.resume();
        req.on('end', () => refuse(req, res));
        return;
    }
    forward(req, res);
}).listen(port, '127.0.0.1', () => log('listening ' + port));
