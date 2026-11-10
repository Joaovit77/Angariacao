// Bloqueio técnico de rede para a suíte inteira; nenhuma tentativa é autorizada.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
let attempts=0;
const deny=()=>{attempts++;throw Error('REDE_BLOQUEADA_JEV_S2_G_A');};
globalThis.fetch=deny;
http.request=deny;http.get=deny;https.request=deny;https.get=deny;
net.Socket.prototype.connect=deny;tls.connect=deny;dgram.Socket.prototype.send=deny;
dns.lookup=deny;dns.resolve=deny;dns.promises.lookup=deny;dns.promises.resolve=deny;
Object.defineProperty(globalThis,'__JEV_OFFLINE_NETWORK_ATTEMPTS',{get:()=>attempts,configurable:false});
syncBuiltinESMExports();
process.on('exit',()=>{if(attempts!==0)process.exitCode=1;});
