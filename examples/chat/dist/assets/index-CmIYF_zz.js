(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))o(n);new MutationObserver(n=>{for(const s of n)if(s.type==="childList")for(const a of s.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function r(n){const s={};return n.integrity&&(s.integrity=n.integrity),n.referrerPolicy&&(s.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?s.credentials="include":n.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function o(n){if(n.ep)return;n.ep=!0;const s=r(n);fetch(n.href,s)}})();const k={setInterval(...e){var t;return(((t=k.delegate)==null?void 0:t.setInterval)||setInterval)(...e)},clearInterval(e){var t;return(((t=k.delegate)==null?void 0:t.clearInterval)||clearInterval)(e)},delegate:void 0},C={setTimeout(...e){var t;return(((t=C.delegate)==null?void 0:t.setTimeout)||setTimeout)(...e)},clearTimeout(e){var t;return(((t=C.delegate)==null?void 0:t.clearTimeout)||clearTimeout)(e)},delegate:void 0},L={info(...e){var t;return(((t=L.delegate)==null?void 0:t.info)||console.info)(...e)},warn(...e){var t;return(((t=L.delegate)==null?void 0:t.warn)||console.warn)(...e)},error(...e){var t;return(((t=L.delegate)==null?void 0:t.error)||console.error)(...e)},delegate:void 0},H={query(){return navigator.locks.query()},request(e,t,r){const o=navigator.locks;return r===void 0?o.request(e,t):o.request(e,t,r)},delegate:void 0};function J(e){return function(r,o){const{port1:n,port2:s}=e.createChannel();let a=!1,d=!1,u;return{name:r,launch:()=>{if(a)throw new Error(`Actor "${r}" is already launched`);u=o({name:r,postMessage:n.postMessage.bind(n),addEventListener:n.addEventListener.bind(n),removeEventListener:n.removeEventListener.bind(n)}),a=!0},destroy:()=>{var h,v;if(d)throw new Error(`Actor "${r}" is already destroyed`);d=!0,(h=n.destroy)==null||h.call(n),(v=s.destroy)==null||v.call(s),typeof u=="function"&&u()},postMessage:s.postMessage.bind(s),addEventListener:s.addEventListener.bind(s),removeEventListener:s.removeEventListener.bind(s)}}}function M(e){return typeof e=="object"&&e!==null&&"__"in e}function A(e,t,r,o){return{__:!0,type:e,data:t,transferable:r,__route:void 0,__checkpoints:void 0}}function V(e){return{__:!0,type:e.type,data:e.data,transferable:e.transferable,__route:e.__route,__checkpoints:e.__checkpoints}}const f={Error:"error",Message:"message",MessageError:"messageerror"};function G(){const e={[f.Error]:new Set,[f.Message]:new Set,[f.MessageError]:new Set};function t(n,s){const a=e[n];if(a==null)throw new Error(`Unsupported event type: ${n}`);a.add(s)}function r(n,s){const a=e[n];if(a==null)throw new Error(`Unsupported event type: ${n}`);a.delete(s)}function o(n,s){Promise.resolve().then(()=>{if(e[n]==null)throw new Error(`Unsupported event type: ${n}`);const a=e[n];for(let d of a)d(s)})}return{destroy(){Promise.resolve().then(()=>{e[f.Error].clear(),e[f.Message].clear(),e[f.MessageError].clear()})},postMessage(n,s){const a=M(n)?n.type:f.Message;if(M(n)&&n.type!==f.Message)o(n.type,n.data);else{const d=M(n)?n:A(f.Message,n,s);o(a,d)}},addEventListener:t,removeEventListener:r}}function j(){const e=G(),t=G(),r=()=>{var s,a;(s=e.destroy)==null||s.call(e),(a=t.destroy)==null||a.call(t)},o={destroy:r,postMessage:t.postMessage.bind(t),addEventListener:e.addEventListener.bind(e),removeEventListener:e.removeEventListener.bind(e)},n={destroy:r,postMessage:e.postMessage.bind(e),addEventListener:t.addEventListener.bind(t),removeEventListener:t.removeEventListener.bind(t)};return{port1:o,port2:n}}const Q=J({createChannel:j}),I="/";function R(...e){return e.join(I)}function X(e,t){return e+I+t}function Z(e,t){return e.slice(0,e.length-t.length-I.length)}function ee(e,t){return e.endsWith(I+t)}const te=()=>{};function B(){return Math.random()*Date.now()}function O(){return Math.round(B()).toString(32)}const P=new WeakMap;function ne(e){return P.has(e)||P.set(e,B()),P.get(e)}const re=e=>typeof Window<"u"&&e instanceof Window,oe=e=>typeof SharedWorkerGlobalScope<"u"&&e instanceof SharedWorkerGlobalScope,se=e=>typeof DedicatedWorkerGlobalScope<"u"&&e instanceof DedicatedWorkerGlobalScope,ae=e=>typeof e=="object"&&e!==null&&"postMessage"in e&&typeof e.postMessage=="function",ie=e=>typeof e=="object"&&e!==null&&"addEventListener"in e&&typeof e.addEventListener=="function"&&"removeEventListener"in e&&typeof e.removeEventListener=="function",U=e=>ae(e)&&ie(e),le=oe(globalThis)?`${self.name}(sharedWorker)`:se(globalThis)?`${self.name}(dedicatedWorker)`:re(globalThis)?"window":"unknown",ce=`${le}[${O()}]`;function _(e,t,r){const n=r instanceof MessageEvent?r.data:r,s=M(n)&&n.type===t?n:A(t,n),a=M(s)?s.transferable:void 0;e.postMessage(s,a)}function F(e,t,r){var o;const n={[f.Error]:t,[f.Message]:r,[f.MessageError]:t};(o=e.start)==null||o.call(e);const s=Object.values(f).map(a=>{const d=u=>{u instanceof MessageEvent&&(u=u.data),n[a](a,u)};return e.addEventListener(a,d),()=>e.removeEventListener(a,d)});return()=>s.forEach(a=>a())}function W(e){const t="<"+ce+"-"+ne(e)+">";return"name"in e&&typeof e.name=="string"?e.name+t:e instanceof MessagePort?"MessagePort"+t:"UnknownTransmitter"+t}function Y(e,t){const r=D(e,t),o=D(t,e);return()=>{r(),o()}}function D(e,t){const r=(n,s)=>_(t,n,s),o=de(e,t);return F(e,r,o)}function de(e,t){const r=W(e),o=W(t);return function(s,a){if(M(a)){const d=ue(a,r,o);d&&_(t,s,d)}else _(t,s,a)}}function ue(e,t,r){const o=V(e);if(o.__checkpoints=X(o.__checkpoints??R(),t),o.__route!==void 0){if(!ee(o.__route,r))return;o.__route=Z(o.__route,r)}return o}function pe(e,t){return e instanceof Error?e:e!=null&&typeof e=="object"&&"message"in e&&typeof e.message=="string"?new Error(e.message):typeof e=="string"?new Error(e):new Error(t,{cause:e})}async function ge(e,t,r){return new Promise((o,n)=>{var s;(s=r?.abortSignal)==null||s.addEventListener("abort",()=>{var v;n(pe((v=r?.abortSignal)==null?void 0:v.reason,"Request aborted")),h()},{once:!0});const a=r?.channelId??O(),d=M(t)?t:A(f.Message,t,r?.transferable);d.__checkpoints=R(a);const u=k.setInterval(()=>_(e,d.type,d),r?.retryDelay??500),x=F(e,(v,b)=>{n(b),h()},(v,b)=>{if(!M(b))throw new Error("Non-envelope message received");b.__route===a&&(o(b),h())}),h=()=>{k.clearInterval(u),x()};_(e,d.type,d)})}const fe=globalThis.navigator!==void 0&&globalThis.navigator.locks!==void 0;fe||L.error("navigator.locks is not implemented");function ve(e){return new Promise((t,r)=>{H.request(e,()=>new Promise(o=>{t(o)})).catch(r)})}function me(e,t){return new Promise((r,o)=>{H.request(e,{signal:t},()=>(r(void 0),Promise.resolve())).catch(o)})}const q="CHANNEL_HANDSHAKE";function he(e,t,r){const o=O(),n=ve("openChannel"+o);return new Promise(async(s,a)=>{const d=await n,u=await ge(e,t,{...r,channelId:R(o)});if(!U(u.data)){a(new Error("Invalid handshake response"));return}const c=u.data,E=j(),x=Y(c,E.port1),h=()=>{x(),c.removeEventListener("message",v),b.abort(),E.port2.destroy(),c.close(),d()};C.setTimeout(()=>c.postMessage(q));const v=T=>{T.data===q&&(c.removeEventListener("message",v),s({...E.port2,close:h}))};c.addEventListener("message",v);const b=new AbortController;me("supportChannel"+o,b.signal).then(()=>{_(E.port1,f.Error,new Error("Lose Channel")),h()}).catch(te)}).catch(s=>{throw n.then(a=>a()),s})}function ye(e,t){return Y(e,t)}function be(e){if(U(e))return e;if(typeof e=="object"&&e!==null&&"port"in e&&U(e.port))return e.port;throw new Error("Invalid worker")}function Ee(e,t){const r=be(t);return ye(e,r)}const w={Error:"error",Message:"message",MessageError:"messageerror"};function S(e,t,r,o){return{__:!0,type:e,data:t,transferable:r,__route:o?.route,__checkpoints:o?.checkpoints}}const m={SEND_MESSAGE:"SEND_MESSAGE",NEW_MESSAGE:"NEW_MESSAGE",USER_JOIN:"USER_JOIN",USER_LEAVE:"USER_LEAVE",USER_TYPING:"USER_TYPING",USER_STOP_TYPING:"USER_STOP_TYPING",USERS_UPDATE:"USERS_UPDATE",ROOM_CHANGE:"ROOM_CHANGE",CONNECTION_STATUS:"CONNECTION_STATUS"},we=[{id:"general",name:"General",description:"General discussion"},{id:"random",name:"Random",description:"Random chat"},{id:"tech",name:"Tech",description:"Technical discussions"},{id:"games",name:"Games",description:"Gaming chat"}];function Se(){return Q("chat-ui-actor",e=>{let t=null,r="general",o=null,n=[],s=[],a=new Set,d="connecting",u=null,c=null;const E=()=>Math.random().toString(36).substring(2,11),x=()=>{const i=["Happy","Clever","Bright","Swift","Gentle","Brave","Kind","Smart"],l=["Cat","Dog","Bird","Fox","Bear","Deer","Wolf","Lion"],p=i[Math.floor(Math.random()*i.length)],y=l[Math.floor(Math.random()*l.length)];return`${p}${y}${Math.floor(Math.random()*100)}`},h=async()=>{o={id:E(),name:x(),joinedAt:Date.now()};try{c=await he(e,{type:"chat:open-channel"}),c.addEventListener("message",i=>{const l=i.data;switch(l.type){case m.NEW_MESSAGE:n.push(l.payload.message),n.length>1e3&&(n=n.slice(-1e3)),T();break;case m.USERS_UPDATE:s=l.payload.users.filter(p=>p.id!==o?.id),z();break;case m.USER_TYPING:l.payload.userId!==o?.id&&l.payload.room===r&&(a.add(l.payload.userName),$());break;case m.USER_STOP_TYPING:{const p=s.find(y=>y.id===l.payload.userId);p&&l.payload.room===r&&(a.delete(p.name),$());break}case m.CONNECTION_STATUS:d=l.payload.status,N();break}}),c.addEventListener("error",()=>{d="disconnected",N()}),c.postMessage(S(w.Message,{type:m.USER_JOIN,payload:{user:o}}))}catch(i){d="disconnected",N(),console.error("Failed to open chat channel",i)}},v=i=>new Date(i).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),b=i=>{const l=i.userId===o?.id,p=i.userId==="system",y=document.createElement("div");return y.className=`message-slide-in mb-4 ${p?"text-center":""}`,p?y.innerHTML=`
          <div class="text-sm text-gray-500 italic">
            ${i.text}
          </div>
        `:y.innerHTML=`
          <div class="message-bubble ${l?"own bg-blue-500 text-white ml-auto":"other bg-white border"} p-3 rounded-lg shadow-sm">
            <div class="flex justify-between items-start mb-1">
              <span class="font-semibold text-sm ${l?"text-blue-100":"text-gray-900"}">${i.userName}</span>
              <span class="text-xs ${l?"text-blue-200":"text-gray-500"} ml-2">${v(i.timestamp)}</span>
            </div>
            <div class="text-sm">${i.text}</div>
          </div>
        `,y},T=()=>{const i=t?.querySelector("#messages-container");if(!i)return;const l=n.filter(p=>p.room===r);i.innerHTML="",l.forEach(p=>{i.appendChild(b(p))}),i.scrollTop=i.scrollHeight},z=()=>{const i=t?.querySelector("#users-list");i&&(i.innerHTML=s.map(l=>`
        <div class="flex items-center p-2 rounded-lg ${l.isTyping?"bg-yellow-50":"bg-gray-50"} mb-2">
          <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3 user-online ${l.isTyping?"user-typing":""}">
            ${l.name[0].toUpperCase()}
          </div>
          <div class="flex-1">
            <div class="font-medium text-sm text-gray-900">${l.name}</div>
            ${l.isTyping?'<div class="text-xs text-yellow-600">typing...</div>':""}
          </div>
        </div>
      `).join(""))},N=()=>{const i=t?.querySelector("#connection-status");if(!i)return;i.className=`connection-status text-sm font-medium ${d}`;const l={connected:"Connected",connecting:"Connecting...",disconnected:"Disconnected"}[d];i.textContent=l},$=()=>{const i=t?.querySelector("#typing-indicator");if(i)if(a.size>0){const l=Array.from(a),p=l.length===1?`${l[0]} is typing...`:`${l.slice(0,-1).join(", ")} and ${l[l.length-1]} are typing...`;i.innerHTML=`
          <div class="flex items-center text-sm text-gray-500 italic p-2">
            <div class="flex space-x-1 mr-2">
              <div class="w-2 h-2 bg-gray-400 rounded-full typing-dots"></div>
              <div class="w-2 h-2 bg-gray-400 rounded-full typing-dots"></div>
              <div class="w-2 h-2 bg-gray-400 rounded-full typing-dots"></div>
            </div>
            ${p}
          </div>
        `}else i.innerHTML=""},K=()=>{if(t=document.querySelector("#app"),!t)return;t.innerHTML=`
        <div class="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
          <!-- Sidebar -->
          <div class="w-full lg:w-80 bg-white border-r border-gray-200 flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b border-gray-200">
              <h1 class="text-xl font-bold text-gray-900 mb-2">Multi-Tab Chat</h1>
              <div id="connection-status" class="connection-status text-sm font-medium connecting">Connecting...</div>
            </div>

            <!-- Room Selection -->
            <div class="p-4 border-b border-gray-200">
              <label class="block text-sm font-medium text-gray-700 mb-2">Room</label>
              <select id="room-select" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                ${we.map(g=>`<option value="${g.id}" ${g.id===r?"selected":""}>${g.name}</option>`).join("")}
              </select>
            </div>

            <!-- Online Users -->
            <div class="flex-1 p-4 overflow-y-auto">
              <h3 class="text-sm font-medium text-gray-700 mb-3">Online Users</h3>
              <div id="users-list" class="user-list space-y-2">
                <!-- Users will be populated here -->
              </div>
            </div>
          </div>

          <!-- Chat Area -->
          <div class="flex-1 flex flex-col">
            <!-- Messages Container -->
            <div class="flex-1 p-4 overflow-y-auto messages-container" id="messages-container">
              <!-- Messages will be populated here -->
            </div>

            <!-- Typing Indicator -->
            <div id="typing-indicator" class="px-4">
              <!-- Typing indicator will appear here -->
            </div>

            <!-- Message Input -->
            <div class="p-4 border-t border-gray-200 bg-white">
              <div class="flex space-x-3">
                <input 
                  type="text" 
                  id="message-input" 
                  placeholder="Type your message..." 
                  class="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxlength="500"
                >
                <button 
                  id="send-button" 
                  class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium"
                  disabled
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      `;const i=t.querySelector("#message-input"),l=t.querySelector("#send-button"),p=t.querySelector("#room-select"),y=()=>{const g=i.value.trim();!g||!o||!c||(c.postMessage(S(w.Message,{type:m.SEND_MESSAGE,payload:{text:g,room:r}})),i.value="",l.disabled=!0,u&&(clearTimeout(u),u=null),c&&c.postMessage(S(w.Message,{type:m.USER_STOP_TYPING,payload:{userId:o.id,room:r}})))};l.addEventListener("click",y),i.addEventListener("keypress",g=>{g.key==="Enter"&&(g.preventDefault(),y())}),i.addEventListener("input",()=>{const g=i.value.trim().length>0;l.disabled=!g,!(!o||!c)&&(g?(c?.postMessage(S(w.Message,{type:m.USER_TYPING,payload:{userId:o.id,userName:o.name,room:r}})),u&&clearTimeout(u),u=setTimeout(()=>{c?.postMessage(S(w.Message,{type:m.USER_STOP_TYPING,payload:{userId:o.id,room:r}}))},2e3)):(u&&(clearTimeout(u),u=null),c&&c.postMessage(S(w.Message,{type:m.USER_STOP_TYPING,payload:{userId:o.id,room:r}}))))}),p.addEventListener("change",()=>{const g=p.value;g!==r&&(r=g,c&&c.postMessage(S(w.Message,{type:m.ROOM_CHANGE,payload:{room:r}})),T())})};typeof window<"u"&&window.addEventListener("beforeunload",()=>{try{o&&c&&(c.postMessage(S(w.Message,{type:m.USER_LEAVE,payload:{userId:o.id}})),c.close())}catch{}}),setTimeout(()=>{K(),h()},50)})}async function Me(){console.log("🚀 Starting multi-tab chat application...");try{const e=Se(),t=new SharedWorker(new URL("/assets/chat-server.worker-CmAQkF63.js",import.meta.url),{type:"module"}),r=Ee(e,t);e.launch(),console.log("✅ Chat application running"),console.log("- UI Actor: handles DOM interactions and user input"),console.log("- SharedWorker: manages chat state across all tabs"),console.log("- Multi-tab sync: messages and users synchronized in real-time"),window.addEventListener("beforeunload",()=>{console.log("🧹 Shutting down chat application...");try{r(),e.destroy(),t.port.close()}catch(o){console.warn("Cleanup error:",o)}}),window.addEventListener("error",o=>{console.error("🚨 Application error:",o.error)})}catch(e){console.error("💥 Failed to start chat application:",e);const t=document.querySelector("#app");t&&(t.innerHTML=`
        <div class="min-h-screen bg-red-50 flex items-center justify-center">
          <div class="bg-white p-8 rounded-lg shadow-lg max-w-md">
            <div class="text-center mb-6">
              <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h1 class="text-xl font-bold text-red-600 mb-2">Chat Startup Error</h1>
              <p class="text-gray-700 mb-4">Failed to initialize the chat application.</p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg mb-4">
              <pre class="text-sm text-gray-800 overflow-auto max-h-32">
${e instanceof Error?e.message:String(e)}
              </pre>
            </div>
            
            <div class="text-center">
              <button 
                onclick="location.reload()" 
                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
            
            <div class="mt-4 text-center">
              <p class="text-xs text-gray-500">
                This chat application requires SharedWorker support and modern browser features.
              </p>
            </div>
          </div>
        </div>
      `)}}if("serviceWorker"in navigator&&"SharedWorker"in window)Me();else{const e=document.querySelector("#app");e&&(e.innerHTML=`
      <div class="min-h-screen bg-yellow-50 flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h1 class="text-xl font-bold text-yellow-600 mb-2">Browser Not Supported</h1>
            <p class="text-gray-700 mb-4">This chat application requires a modern browser with SharedWorker support.</p>
          </div>
          
          <div class="text-center">
            <p class="text-sm text-gray-600 mb-4">
              Please use Chrome, Firefox, or another modern browser to experience multi-tab chat synchronization.
            </p>
            <a 
              href="https://caniuse.com/sharedworkers" 
              target="_blank" 
              rel="noopener noreferrer"
              class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              Check Browser Support
            </a>
          </div>
        </div>
      </div>
    `)}
