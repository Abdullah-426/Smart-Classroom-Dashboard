import fs from "node:fs";

const flowPath = "E:/Wireless Project/Smart Classroom Dashboard/all_flows_edit.json";
const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));

function hasNode(id) {
  return flow.some((n) => n.id === id);
}

function pushIfMissing(node) {
  if (!hasNode(node.id)) flow.push(node);
}

// GET /api/attendance/live
pushIfMissing({
  id: "a4100001b2c3d4e5",
  type: "http in",
  z: "51ea9c70bb53699f",
  name: "GET /api/attendance/live",
  url: "/api/attendance/live",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 170,
  y: 2090,
  wires: [["a4100002b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100002b2c3d4e5",
  type: "http request",
  z: "51ea9c70bb53699f",
  name: "GET attendance live (storage bridge)",
  method: "GET",
  ret: "txt",
  paytoqs: "ignore",
  url: "http://host.docker.internal:4050/api/storage/attendance/live",
  tls: "",
  persist: false,
  proxy: "",
  authType: "",
  senderr: false,
  headers: [],
  x: 430,
  y: 2090,
  wires: [["a4100003b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100003b2c3d4e5",
  type: "json",
  z: "51ea9c70bb53699f",
  name: "",
  property: "payload",
  action: "",
  pretty: false,
  x: 670,
  y: 2090,
  wires: [["a4100004b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100004b2c3d4e5",
  type: "http response",
  z: "51ea9c70bb53699f",
  name: "",
  statusCode: "",
  headers: {},
  x: 900,
  y: 2090,
  wires: [],
});

// POST /api/attendance/session/start
pushIfMissing({
  id: "a4100005b2c3d4e5",
  type: "http in",
  z: "51ea9c70bb53699f",
  name: "POST /api/attendance/session/start",
  url: "/api/attendance/session/start",
  method: "post",
  upload: false,
  swaggerDoc: "",
  x: 200,
  y: 2130,
  wires: [["a4100006b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100006b2c3d4e5",
  type: "function",
  z: "51ea9c70bb53699f",
  name: "Attendance Session Start Prepare",
  func:
    "let body = msg.req && msg.req.body;\nif (typeof body === \"string\") {\n  try { body = JSON.parse(body); } catch { body = {}; }\n}\nmsg.headers = { \"Content-Type\": \"application/json\" };\nmsg.payload = body && typeof body === \"object\" ? body : {};\nreturn msg;",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 460,
  y: 2130,
  wires: [["a4100007b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100007b2c3d4e5",
  type: "http request",
  z: "51ea9c70bb53699f",
  name: "POST attendance session start (storage bridge)",
  method: "POST",
  ret: "txt",
  paytoqs: "ignore",
  url: "http://host.docker.internal:4050/api/storage/attendance/session/start",
  tls: "",
  persist: false,
  proxy: "",
  authType: "",
  senderr: false,
  headers: [],
  x: 760,
  y: 2130,
  wires: [["a4100008b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100008b2c3d4e5",
  type: "json",
  z: "51ea9c70bb53699f",
  name: "",
  property: "payload",
  action: "",
  pretty: false,
  x: 1030,
  y: 2130,
  wires: [["a4100009b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100009b2c3d4e5",
  type: "http response",
  z: "51ea9c70bb53699f",
  name: "",
  statusCode: "",
  headers: {},
  x: 1240,
  y: 2130,
  wires: [],
});

// POST /api/attendance/session/end
pushIfMissing({
  id: "a4100010b2c3d4e5",
  type: "http in",
  z: "51ea9c70bb53699f",
  name: "POST /api/attendance/session/end",
  url: "/api/attendance/session/end",
  method: "post",
  upload: false,
  swaggerDoc: "",
  x: 190,
  y: 2170,
  wires: [["a4100011b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100011b2c3d4e5",
  type: "function",
  z: "51ea9c70bb53699f",
  name: "Attendance Session End Prepare",
  func: "msg.headers = { \"Content-Type\": \"application/json\" }; msg.payload = {}; return msg;",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 450,
  y: 2170,
  wires: [["a4100012b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100012b2c3d4e5",
  type: "http request",
  z: "51ea9c70bb53699f",
  name: "POST attendance session end (storage bridge)",
  method: "POST",
  ret: "txt",
  paytoqs: "ignore",
  url: "http://host.docker.internal:4050/api/storage/attendance/session/end",
  tls: "",
  persist: false,
  proxy: "",
  authType: "",
  senderr: false,
  headers: [],
  x: 750,
  y: 2170,
  wires: [["a4100013b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100013b2c3d4e5",
  type: "json",
  z: "51ea9c70bb53699f",
  name: "",
  property: "payload",
  action: "",
  pretty: false,
  x: 1020,
  y: 2170,
  wires: [["a4100014b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100014b2c3d4e5",
  type: "http response",
  z: "51ea9c70bb53699f",
  name: "",
  statusCode: "",
  headers: {},
  x: 1230,
  y: 2170,
  wires: [],
});

// GET /api/attendance/export.csv
pushIfMissing({
  id: "a4100015b2c3d4e5",
  type: "http in",
  z: "51ea9c70bb53699f",
  name: "GET /api/attendance/export.csv",
  url: "/api/attendance/export.csv",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 200,
  y: 2210,
  wires: [["a4100016b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100016b2c3d4e5",
  type: "http request",
  z: "51ea9c70bb53699f",
  name: "GET attendance export csv (storage bridge)",
  method: "GET",
  ret: "txt",
  paytoqs: "ignore",
  url: "http://host.docker.internal:4050/api/storage/attendance/export.csv",
  tls: "",
  persist: false,
  proxy: "",
  authType: "",
  senderr: false,
  headers: [],
  x: 500,
  y: 2210,
  wires: [["a4100017b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100017b2c3d4e5",
  type: "function",
  z: "51ea9c70bb53699f",
  name: "Attendance Export CSV Response",
  func:
    "msg.headers = {\n  \"Content-Type\": \"text/csv; charset=utf-8\",\n  \"Content-Disposition\": \"attachment; filename=attendance-export.csv\"\n};\nreturn msg;",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 770,
  y: 2210,
  wires: [["a4100018b2c3d4e5"]],
});

pushIfMissing({
  id: "a4100018b2c3d4e5",
  type: "http response",
  z: "51ea9c70bb53699f",
  name: "",
  statusCode: "",
  headers: {},
  x: 1030,
  y: 2210,
  wires: [],
});

fs.writeFileSync(flowPath, JSON.stringify(flow, null, 4), "utf8");
console.log("Attendance Phase 4 proxy endpoints added/updated.");
