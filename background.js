const setLastError = (msg) => chrome.storage.sync.set({ errorMsg: msg });

const readLocalStorage = async (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, resolve);
  });
};

async function getTokenAndBase() {
  const { alistUrl, alistUsername, alistHash } = await readLocalStorage(['alistUrl', 'alistUsername', 'alistHash']);
  if (!alistUrl) {
    setLastError("failed: no url");
    return [null, null];
  }
  const hashUrl = new URL('/api/auth/login/hash', alistUrl).href;
  const resp = await fetch(hashUrl, {
    method: 'POST',
    body: `{"username":"${alistUsername}","password":"${alistHash}"}`,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8'
    }
  });
  const json = await resp.json();
  if (json.code != 200) {
    setLastError(`get token failed: ${json.message}`);
    return [null, null];
  }
  return [json.data.token, alistUrl];
}

async function updateCookieToAlist(cookie) {
  const [token, url] = await getTokenAndBase();
  if (!token) {
    return;
  }
  const listUrl = new URL('/api/admin/storage/list', url).href;
  const resp = await fetch(listUrl, {headers: {"authorization": token}});
  const obj = await resp.json();
  const item = obj.data.content.find(x => x.driver == '115 Cloud');
  if (!item) {
    setLastError("cannot find storage");
    return;
  }
  let addition = JSON.parse(item.addition);
  addition.cookie = cookie;
  item.addition = JSON.stringify(addition);
  const updateUrl = new URL('/api/admin/storage/update', url).href;
  const setResp = await fetch(updateUrl, {
    method: 'POST',
    headers: { "authorization": token, 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(item),
  });
  const setObj = await setResp.json();
  if (setObj.code != 200) {
    setLastError(`update failed: ${setObj.message}`);
    return;
  }

  console.log(new Date(), 'update succ');
  setLastError('success');
}

function interceptCookie() {
  chrome.cookies.getAll({ domain: ".115.com" }, cookies => {
    const lastInterceptedCookie = cookies.filter(x => x.domain == '.115.com').map(c => `${c.name}=${c.value}`).join("; ");
    const lastInterceptedTime = new Date().toLocaleString();
    chrome.storage.sync.set({ lastInterceptedCookie, lastInterceptedTime });
    updateCookieToAlist(lastInterceptedCookie);
  });
}

chrome.cookies.onChanged.addListener(async (evt) => {
  if (evt.removed || !evt.cookie.domain.includes('.115.com')) {
    return;
  }

  interceptCookie();
});

chrome.runtime.onInstalled.addListener(function (details) {
  interceptCookie();
});

chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    if (request.msg == "sync") interceptCookie();
  }
);
