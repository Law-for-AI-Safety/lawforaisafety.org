// Renders the real running site in an iframe instead of Decap's default
// field-dump preview, and keeps it in sync with unsaved draft edits via
// postMessage. See src/app/HomeClient.tsx's usePreviewData for the
// receiving side. Only affects the /admin preview pane — the deployed
// site never posts or listens for these messages.
var SitePreview = createClass({
  getInitialState: function () {
    return { ready: false };
  },

  componentDidMount: function () {
    var self = this;
    window.addEventListener("message", function (event) {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === "decap-preview-ready") {
        self.setState({ ready: true });
      }
    });
  },

  componentDidUpdate: function () {
    this.postUpdate();
  },

  postUpdate: function () {
    if (!this.state.ready || !this.frameEl || !this.frameEl.contentWindow) return;
    var data = this.props.entry.get("data").toJS();
    this.frameEl.contentWindow.postMessage(
      { type: "decap-preview-update", payload: data },
      window.location.origin
    );
  },

  handleLoad: function () {
    // A fresh navigation resets the iframe's listener; state.ready flips
    // again once it re-announces itself via "decap-preview-ready".
    this.setState({ ready: false });
  },

  render: function () {
    var self = this;
    return h("iframe", {
      ref: function (el) {
        self.frameEl = el;
      },
      src: window.location.origin + "/",
      onLoad: this.handleLoad,
      style: { width: "100%", height: "100vh", border: "none" },
      title: "Live preview",
    });
  },
});

// Files-type collections key the preview registry by the file's own
// `name` (public/admin/config.yml: files[].name: "home"), not the
// collection's name ("content").
CMS.registerPreviewTemplate("home", SitePreview);
