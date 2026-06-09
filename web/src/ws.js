export function connectRadioStream(onMessage) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/stream`);
  socket.addEventListener("message", (event) => onMessage(JSON.parse(event.data)));
  return socket;
}
