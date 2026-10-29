const CHAIN_ID = 20261;
const INDEXER = "http://localhost:8081";
const KMS = "http://localhost:7070";
const $ = (id) => document.getElementById(id);
let provider, signer, registry, dep, lastSig;

async function loadDeployment() {
  if (!dep) dep = await (await fetch("/deployments/besu.json", { cache: "no-store" })).json();
  return dep;
}

async function hashFile(file) {
  return ethers.keccak256(new Uint8Array(await file.arrayBuffer()));
}

$("connect").onclick = async () => {
  if (!window.ethereum) return alert("Instala Metamask");
  const hexId = "0x" + CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e) {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hexId, chainName: "Taller Besu QBFT", rpcUrls: ["http://localhost:8545"],
                 nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }],
    });
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  const d = await loadDeployment();
  registry = new ethers.Contract(d.EventRegistry.address, d.EventRegistry.abi, signer);
  $("acct").textContent = await signer.getAddress();
  loadEvents();
};

$("register").onclick = async () => {
  try {
    const f = $("file").files[0];
    if (!f || !registry) throw new Error("conecta la billetera y elige un archivo");
    const h = await hashFile(f);
    $("regOut").textContent = "hash " + h + "\nesperando firma en Metamask...";
    const tx = await registry.registerEvent(h, $("kind").value, $("uri").value);
    $("regOut").textContent += "\ntx " + tx.hash;
    const rc = await tx.wait();
    $("regOut").textContent += `\nconfirmada en bloque ${rc.blockNumber} (finalidad inmediata en QBFT)`;
    setTimeout(loadEvents, 1500);
  } catch (e) { $("regOut").textContent = "Error: " + (e.reason || e.shortMessage || e.message); }
};

$("verify").onclick = async () => {
  try {
    const f = $("vfile").files[0];
    if (!f) throw new Error("elige un archivo");
    const d = await loadDeployment();
    const ro = new ethers.JsonRpcProvider("http://localhost:8545");
    const c = new ethers.Contract(d.EventRegistry.address, d.EventRegistry.abi, ro);
    const h = await hashFile(f);
    const [exists, r] = await c.verify(h);
    $("verOut").innerHTML = exists
      ? `<span class="ok">REGISTRADO</span> ${h}\nemisor ${r.issuer}\nbloque ${r.blockNumber} · ${new Date(Number(r.timestamp) * 1000).toISOString()}`
      : `<span class="bad">NO existe</span> ${h}`;
  } catch (e) { $("verOut").textContent = "Error: " + e.message; }
};

$("sign").onclick = async () => {
  try {
    if (!signer) throw new Error("conecta la billetera");
    const message = $("msg").value;
    const signature = await signer.signMessage(message);
    const recovered = ethers.verifyMessage(message, signature);
    lastSig = { message, signature, address: await signer.getAddress() };
    $("sigOut").textContent = `firma ${signature}\nr ${signature.slice(0, 66)}\nrecuperada localmente: ${recovered}`;
  } catch (e) { $("sigOut").textContent = "Error: " + e.message; }
};

$("kmsVerify").onclick = async () => {
  try {
    if (!lastSig) throw new Error("firma primero");
    const r = await fetch(KMS + "/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lastSig) });
    $("kmsOut").textContent = JSON.stringify(await r.json(), null, 2);
  } catch (e) { $("kmsOut").textContent = "Error: " + e.message; }
};

async function loadEvents() {
  try {
    const ev = await (await fetch(INDEXER + "/events")).json();
    $("rows").innerHTML = ev.map((e) =>
      `<tr><td>${e.id}</td><td>${e.docHash.slice(0, 14)}…</td><td>${e.issuer.slice(0, 10)}…</td><td>${e.kind}</td><td>${e.blockNumber}</td></tr>`).join("");
  } catch (e) { $("idxOut").textContent = "Indexador no disponible: " + e.message; }
}
$("reload").onclick = loadEvents;

// Flujo servidor: el backend arma la tx y el KMS la firma (sin llaves en el navegador ni en el backend).
$("viaKms").onclick = async () => {
  try {
    let keys = await (await fetch(KMS + "/keys")).json();
    if (!keys.length) keys = [await (await fetch(KMS + "/keys", { method: "POST" })).json()];
    const r = await fetch(INDEXER + "/register", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: keys[0].id, content: "evento-" + Date.now(), kind: "VIA_KMS" }) });
    $("idxOut").textContent = JSON.stringify(await r.json(), null, 2);
    setTimeout(loadEvents, 4000);
  } catch (e) { $("idxOut").textContent = "Error: " + e.message; }
};

loadEvents();
