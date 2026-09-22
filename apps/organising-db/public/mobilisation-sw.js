self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Mobilisation", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Mobilisation";
  const body = payload.body || "";
  const url = payload.url || "/mobilisation";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      tag: "mobilisation",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/mobilisation";
  event.waitUntil(self.clients.openWindow(url));
});
