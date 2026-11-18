// Injects the full app layout before any DOM refs are resolved.
(function buildApp() {
  const markup = `
    <div class="app-shell">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header sidebar-header-rooms">
                <span id="room-list-heading">SALAS</span>
            </div>
            <div class="room-list" id="room-list" role="list" aria-labelledby="room-list-heading"></div>
            <div class="sidebar-header">
                <span>USUÁRIOS</span>
                <button type="button" id="search-toggle" class="search-toggle" aria-label="Buscar usuários">
                    <i class="bi bi-search"></i>
                </button>
            </div>
            <div class="search-box" id="search-box" hidden>
                <input type="text" id="search-input" placeholder="Buscar @usuário" aria-label="Buscar usuários" autocomplete="off" />
            </div>
            <div class="user-list" id="user-list"></div>
            <div class="profile-card" id="profile-card">
                <button type="button" class="profile-summary" id="profile-summary" aria-expanded="false">
                    <span class="profile-icon"><i class="bi bi-person-circle"></i></span>
                    <span class="profile-name" id="profile-name">@username</span>
                    <span class="profile-chevron"><i class="bi bi-chevron-up"></i></span>
                    <span class="profile-badge" id="profile-badge" hidden></span>
                </button>
                <div class="profile-body" id="profile-body" hidden>
                    <div class="profile-avatar"><i class="bi bi-person-circle"></i></div>
                    <button type="button" class="profile-pfp-btn" id="profile-pfp-btn" aria-label="Foto de perfil">Adicionar PFP</button>
                    <label class="profile-label">Nome de exibição</label>
                    <div class="profile-showname-display" id="profile-showname-display">
                        <span class="profile-showname-value empty" id="profile-showname-value">—</span>
                        <button type="button" id="showname-edit">Adicionar</button>
                    </div>
                    <div class="profile-showname-row" id="showname-edit-row" hidden>
                        <input type="text" id="showname-input" maxlength="20" placeholder="Como quer ser chamado?" aria-label="Nome de exibição" />
                        <button type="button" id="showname-save">Salvar</button>
                        <button type="button" id="showname-cancel">Cancelar</button>
                    </div>
                    <input type="file" id="profile-avatar-input" accept="image/*" hidden />
                    <div class="profile-message" id="profile-message"></div>
                    <div class="profile-requests" id="profile-requests" hidden>
                        <div class="profile-requests-heading">Solicitações recebidas</div>
                        <div class="profile-requests-list" id="profile-requests-list"></div>
                    </div>
                    <button type="button" class="profile-account-btn" id="profile-account-btn" aria-haspopup="dialog" aria-controls="account-view"><i class="bi bi-gear" aria-hidden="true"></i> <span data-str="accountOpen"></span></button>
                    <button type="button" class="profile-logout" id="profile-logout" aria-label="Sair" title="Sair"><i class="bi bi-power"></i></button>
                </div>
            </div>
        </aside>
        <main class="main">
            <div class="dm-placeholder" id="dm-placeholder">
  Selecione um usuário ou uma sala para conversar
  <button type="button" class="dm-menu-btn" id="dm-placeholder-menu-btn" aria-label="Abrir lista de usuários" aria-expanded="false" aria-controls="sidebar">
    <i class="bi bi-list"></i>
  </button>
</div>
            <div class="dm-panel" id="dm-panel" hidden>
                    <div class="dm-header" id="dm-header">
                    <button type="button" class="dm-menu-btn" id="dm-menu-btn" aria-label="Abrir lista de usuários" aria-expanded="false" aria-controls="sidebar">
                        <i class="bi bi-list"></i>
                    </button>
                    <span class="dm-header-avatar" id="dm-header-avatar"><i class="bi bi-person-circle"></i></span>
                    <span class="status-dot offline" id="dm-status" aria-hidden="true"></span>
                    <h4 id="dm-username"></h4>
                </div>
                <div class="dm-typing" id="dm-typing"></div>
                <div class="dm-reply-bar" id="dm-reply-bar" hidden>
                    <div class="dm-reply-info">
                        <span class="dm-reply-label">Respondendo a <strong id="dm-reply-name"></strong></span>
                        <span class="dm-reply-snippet" id="dm-reply-snippet"></span>
                    </div>
                    <button type="button" class="dm-reply-cancel" id="dm-reply-cancel" aria-label="Cancelar resposta"><i class="bi bi-x"></i></button>
                </div>
                <div class="dm-messages" id="dm-messages" tabindex="-1"></div>
                <div class="dm-upload-status" id="dm-upload-status" hidden></div>
                <div class="dm-composer">
                    <input type="file" id="dm-image-input" accept="image/*" multiple hidden />
                    <input type="file" id="dm-audio-input" accept="audio/*" hidden />
                    <input type="file" id="dm-video-input" accept="video/*" hidden />
                    <div class="dm-attach-wrap">
                        <button type="button" class="dm-attach-btn" id="dm-attach" aria-label="Anexo"><i class="bi bi-paperclip"></i></button>
                        <div class="dm-attach-menu" id="dm-attach-menu">
                            <button type="button" id="dm-image-btn"><i class="bi bi-image"></i> Imagem</button>
                            <button type="button" id="dm-audio-file-btn"><i class="bi bi-mic"></i> Áudio</button>
                            <button type="button" id="dm-video-btn"><i class="bi bi-camera-video"></i> Vídeo</button>
                        </div>
                    </div>
                    <div class="dm-input-wrap">
                        <textarea class="dm-input" id="dm-input" rows="1" placeholder="Digite uma mensagem" aria-label="Mensagem"></textarea>
                        <button type="button" class="dm-emoji-btn" id="dm-emoji-btn" aria-label="Emojis" aria-expanded="false" aria-controls="emoji-picker"><i class="bi bi-emoji-smile"></i></button>
                    </div>
                    <button type="button" class="dm-audio-btn" id="dm-audio" aria-label="Áudio"><i class="bi bi-mic"></i></button>
                    <button type="button" class="dm-send-btn" id="dm-send" aria-label="Enviar"><i class="bi bi-send"></i></button>
                </div>
            </div>
            <div class="room-ban" id="room-ban" role="alertdialog" aria-labelledby="room-ban-title" aria-describedby="room-ban-message" tabindex="-1" hidden>
                <i class="bi bi-slash-circle room-ban-icon" aria-hidden="true"></i>
                <h3 id="room-ban-title"></h3>
                <p id="room-ban-message"></p>
            </div>
            <div class="logout-confirm-overlay img-preview-overlay" id="img-preview-overlay" hidden></div>
            <div class="logout-confirm img-preview" id="img-preview" role="dialog" aria-modal="true" aria-labelledby="img-preview-title" aria-describedby="img-preview-info" hidden>
                <h3 id="img-preview-title"></h3>
                <div class="img-preview-stage" id="img-preview-stage">
                    <img id="img-preview-img" alt="" />
                    <div class="img-crop" id="img-crop" hidden>
                        <canvas id="img-crop-canvas" aria-hidden="true"></canvas>
                        <div class="img-crop-box" id="img-crop-box" role="group" data-str-label="imgCropArea">
                            <span class="img-crop-handle nw" data-corner="nw"></span>
                            <span class="img-crop-handle ne" data-corner="ne"></span>
                            <span class="img-crop-handle sw" data-corner="sw"></span>
                            <span class="img-crop-handle se" data-corner="se"></span>
                        </div>
                    </div>
                </div>
                <p id="img-preview-info"></p>
                <div class="img-crop-presets" id="img-crop-presets" role="group" data-str-label="imgCropRatio" hidden></div>
                <p class="img-preview-error" id="img-preview-error" role="alert"></p>
                <div class="logout-confirm-actions" id="img-preview-actions">
                    <button type="button" class="logout-confirm-cancel" id="img-preview-crop"><i class="bi bi-crop" aria-hidden="true"></i> <span data-str="imgCrop"></span></button>
                    <button type="button" class="logout-confirm-cancel" id="img-preview-cancel" data-str="imgCancel"></button>
                    <button type="button" class="logout-confirm-ok img-preview-primary" id="img-preview-send"></button>
                </div>
                <div class="logout-confirm-actions" id="img-crop-actions" hidden>
                    <button type="button" class="logout-confirm-cancel" id="img-crop-reset" data-str="imgReset"></button>
                    <button type="button" class="logout-confirm-cancel" id="img-crop-cancel" data-str="imgCancel"></button>
                    <button type="button" class="logout-confirm-ok img-preview-primary" id="img-crop-apply" data-str="imgApply"></button>
                </div>
            </div>
        </main>
        <aside class="contact-panel" id="contact-panel" hidden aria-label="Informações do contato">
            <button type="button" class="contact-panel-close" id="contact-panel-close" aria-label="Fechar"><i class="bi bi-x"></i></button>
            <div class="contact-panel-tabs" role="tablist" aria-label="Abas do contato">
                <button type="button" class="contact-tab active" id="contact-tab-info" role="tab" aria-selected="true" aria-controls="contact-tab-info-panel">Informações</button>
                <button type="button" class="contact-tab" id="contact-tab-media" role="tab" aria-selected="false" aria-controls="contact-tab-media-panel">Mídia</button>
            </div>
            <div class="contact-panel-body">
                <div class="contact-tab-panel active" id="contact-tab-info-panel" role="tabpanel" aria-labelledby="contact-tab-info">
                    <div class="contact-panel-meta contact-panel-last-seen" id="contact-last-seen"></div>
                    <div class="contact-panel-avatar" id="contact-panel-avatar"><i class="bi bi-person-circle"></i></div>
                    <div class="contact-panel-name" id="contact-name"></div>
                    <div class="contact-panel-handle" id="contact-handle"></div>
                    <div class="contact-panel-status" id="contact-status"></div>
                    <div class="contact-panel-info-list" id="contact-info-list">
                        <div class="contact-panel-info-row" id="contact-account-created">
                            <i class="bi bi-calendar3"></i>
                            <span class="contact-info-label">Conta criada em</span>
                            <span class="contact-info-value" id="contact-account-created-value"></span>
                        </div>
                        <div class="contact-panel-info-row" id="contact-friends-since">
                            <i class="bi bi-people"></i>
                            <span class="contact-info-label">Amigos desde</span>
                            <span class="contact-info-value" id="contact-friends-since-value"></span>
                        </div>
                        <div class="contact-panel-info-row" id="contact-first-conversation">
                            <i class="bi bi-chat-left"></i>
                            <span class="contact-info-label">Primeira conversa em</span>
                            <span class="contact-info-value" id="contact-first-conversation-value"></span>
                        </div>
                    </div>
                    <button type="button" class="contact-panel-unfriend" id="contact-panel-unfriend" hidden>Desfazer amizade</button>
                </div>
                <div class="contact-tab-panel" id="contact-tab-media-panel" role="tabpanel" aria-labelledby="contact-tab-media" hidden>
                    <div class="contact-media-empty" id="contact-media-empty" hidden>Nenhuma mídia</div>
                    <div class="contact-media-section" id="contact-media-images-section">
                        <h5>Imagens</h5>
                        <div class="contact-media-grid" id="contact-media-images"></div>
                    </div>
                    <div class="contact-media-section" id="contact-media-audio-section">
                        <h5>Áudios</h5>
                        <div class="contact-media-list" id="contact-media-audios"></div>
                    </div>
                    <div class="contact-media-section" id="contact-media-video-section">
                        <h5>Vídeos</h5>
                        <div class="contact-media-list" id="contact-media-videos"></div>
                    </div>
                </div>
            </div>
        </aside>
    </div>

    <div class="sidebar-overlay" id="sidebar-overlay" hidden></div>

    <div id="dm-lightbox" class="dm-lightbox" hidden>
      <button type="button" class="dm-lightbox-close" id="dm-lightbox-close" aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
      <button type="button" class="dm-lightbox-nav dm-lightbox-prev" id="dm-lightbox-prev" aria-label="Imagem anterior" hidden><i class="bi bi-chevron-left"></i></button>
      <button type="button" class="dm-lightbox-nav dm-lightbox-next" id="dm-lightbox-next" aria-label="Próxima imagem" hidden><i class="bi bi-chevron-right"></i></button>
      <img id="dm-lightbox-img" alt="Imagem ampliada" />
      <div class="dm-lightbox-thumbs" id="dm-lightbox-thumbs"></div>
    </div>

    <div class="emoji-picker" id="emoji-picker" role="dialog" aria-label="Emojis" hidden>
        <div class="emoji-picker-tabs" id="emoji-picker-tabs" role="tablist" aria-label="Categorias de emoji"></div>
        <div class="emoji-picker-title" id="emoji-picker-title"></div>
        <div class="emoji-picker-grid" id="emoji-picker-grid"></div>
    </div>

    <div class="dm-react-bar" id="dm-react-bar" role="menu" aria-label="Reagir" hidden></div>

    <div class="room-mod-menu" id="room-mod-menu" role="menu" aria-label="Moderação" hidden></div>

    <div class="user-bubble" id="user-bubble" role="dialog" aria-labelledby="user-bubble-name" hidden>
        <button type="button" class="user-bubble-close" id="user-bubble-close" data-str-label="bubbleClose"><i class="bi bi-x" aria-hidden="true"></i></button>
        <div class="user-bubble-avatar" id="user-bubble-avatar"><i class="bi bi-person-circle"></i></div>
        <div class="user-bubble-name" id="user-bubble-name"></div>
        <div class="user-bubble-handle" id="user-bubble-handle"></div>
        <div class="user-bubble-created" id="user-bubble-created"></div>
        <div class="user-bubble-friend" id="user-bubble-friend" hidden><i class="bi bi-people-fill" aria-hidden="true"></i><span id="user-bubble-friend-text"></span></div>
        <div class="user-bubble-actions" id="user-bubble-actions"></div>
    </div>

    <div class="contact-panel-overlay" id="contact-panel-overlay" hidden></div>

    <div class="account-view" id="account-view" role="dialog" aria-modal="true" aria-labelledby="account-title" hidden>
        <div class="account-header">
            <h2 id="account-title" data-str="accountTitle"></h2>
            <button type="button" class="account-close" id="account-close" data-str-label="accountClose"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
        </div>
        <div class="account-scroll" id="account-scroll">
            <div class="account-content">
                <div class="account-load-error" id="account-load-error" hidden>
                    <span data-str="accountLoadFailed"></span>
                    <button type="button" class="account-btn" id="account-retry" data-str="accountRetry"></button>
                </div>

                <section class="account-section" aria-labelledby="account-profile-title">
                    <h3 id="account-profile-title" data-str="accountProfile"></h3>
                    <div class="account-profile">
                        <button type="button" class="account-avatar" id="account-avatar" data-str-label="accountAvatarChange"></button>
                        <div class="account-profile-main">
                            <div class="account-name" id="account-name"></div>
                            <div class="account-handle" id="account-handle"></div>
                            <button type="button" class="account-btn" id="account-avatar-btn"></button>
                        </div>
                    </div>
                    <label class="account-label" for="account-showname-input" data-str="accountShowname"></label>
                    <div class="account-row" id="account-showname-display">
                        <span class="account-value" id="account-showname-value"></span>
                        <button type="button" class="account-btn" id="account-showname-edit"></button>
                    </div>
                    <form class="account-row" id="account-showname-form" novalidate hidden>
                        <input type="text" id="account-showname-input" maxlength="20" autocomplete="off" data-str-placeholder="accountShownamePlaceholder" />
                        <button type="submit" class="account-btn" data-str="accountSave"></button>
                        <button type="button" class="account-btn" id="account-showname-cancel" data-str="accountCancel"></button>
                    </form>
                    <div class="account-message" id="account-profile-message" role="status"></div>
                    <div class="account-name-color" id="account-name-color">
                        <span class="account-label" id="account-name-color-label" data-str="nameColor"></span>
                        <p class="account-note" id="account-name-color-locked" data-str="nameColorLocked" hidden></p>
                        <div id="account-name-color-editor" hidden>
                            <div class="account-name-color-preview" aria-hidden="true">
                                <span class="account-name-color-sample" id="account-name-color-sample"></span>
                            </div>
                            <div class="account-row account-name-color-row">
                                <input type="color" class="account-color-picker" id="account-color-picker" data-str-label="nameColorPick" />
                                <input type="text" class="account-color-hex" id="account-color-hex" maxlength="7" autocomplete="off" autocapitalize="none" spellcheck="false" data-str-label="nameColorHexLabel" />
                                <button type="button" class="account-btn" id="account-color-save" data-str="accountSave"></button>
                            </div>
                            <div class="account-actions">
                                <button type="button" class="account-btn" id="account-color-reset" data-str="nameColorReset"></button>
                            </div>
                            <p class="account-note" data-str="nameColorNote"></p>
                            <div class="account-message" id="account-color-message" role="status"></div>
                        </div>
                    </div>
                    <dl class="account-facts">
                        <div><dt data-str="accountMemberSince"></dt><dd id="account-member-since"></dd></div>
                        <div><dt data-str="accountLastLogin"></dt><dd id="account-last-login"></dd></div>
                        <div><dt data-str="accountFriends"></dt><dd id="account-friends"></dd></div>
                    </dl>
                </section>

                <section class="account-section" aria-labelledby="account-email-title">
                    <h3 id="account-email-title" data-str="accountEmail"></h3>
                    <p class="account-note" id="account-email-unavailable" data-str="emailUnavailable" hidden></p>
                    <div id="account-email-current">
                        <div class="account-row">
                            <span class="account-value" id="account-email-value"></span>
                            <span class="account-badge" id="account-email-badge" data-str="emailVerifiedBadge" hidden></span>
                        </div>
                        <p class="account-note" id="account-email-none-note" data-str="emailNoneNote" hidden></p>
                        <div class="account-actions">
                            <button type="button" class="account-btn" id="account-email-add"></button>
                            <button type="button" class="account-btn danger" id="account-email-remove" data-str="emailRemove" hidden></button>
                        </div>
                    </div>
                    <form id="account-email-form" novalidate hidden>
                        <input type="text" id="account-email-username" autocomplete="username" tabindex="-1" aria-hidden="true" readonly hidden />
                        <label class="account-label" for="account-email-input" data-str="emailNewLabel"></label>
                        <div class="account-row">
                            <input type="email" id="account-email-input" maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" />
                        </div>
                        <label class="account-label" for="account-email-password" data-str="emailPasswordLabel"></label>
                        <div class="account-row">
                            <input type="password" id="account-email-password" autocomplete="current-password" />
                        </div>
                        <p class="account-note" data-str="emailPasswordNote"></p>
                        <div class="account-actions">
                            <button type="submit" class="account-btn" id="account-email-send" data-str="emailSendCode"></button>
                            <button type="button" class="account-btn" id="account-email-form-cancel" data-str="accountCancel"></button>
                        </div>
                    </form>
                    <form id="account-code-form" novalidate hidden>
                        <p class="account-note" id="account-code-sent"></p>
                        <label class="account-label" for="account-code-input" data-str="emailCodeLabel"></label>
                        <div class="account-row">
                            <input type="text" class="account-code-input" id="account-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" />
                            <button type="submit" class="account-btn" id="account-code-submit" data-str="emailConfirm"></button>
                        </div>
                        <div class="account-actions">
                            <button type="button" class="account-btn" id="account-code-resend"></button>
                            <button type="button" class="account-btn" id="account-code-other" data-str="emailUseOther"></button>
                        </div>
                    </form>
                    <form id="account-remove-form" novalidate hidden>
                        <p class="account-note" data-str="emailRemoveNote"></p>
                        <input type="text" id="account-remove-username" autocomplete="username" tabindex="-1" aria-hidden="true" readonly hidden />
                        <label class="account-label" for="account-remove-password" data-str="emailPasswordLabel"></label>
                        <div class="account-row">
                            <input type="password" id="account-remove-password" autocomplete="current-password" />
                            <button type="submit" class="account-btn danger" id="account-remove-submit" data-str="emailRemoveConfirm"></button>
                            <button type="button" class="account-btn" id="account-remove-cancel" data-str="accountCancel"></button>
                        </div>
                    </form>
                    <div class="account-message" id="account-email-message" role="status"></div>
                </section>

                <section class="account-section" aria-labelledby="account-rooms-title">
                    <h3 id="account-rooms-title" data-str="accountRooms"></h3>
                    <dl class="account-facts">
                        <div><dt data-str="accountRole"></dt><dd id="account-role"></dd></div>
                    </dl>
                    <p class="account-note" id="account-bans"></p>
                </section>

                <section class="account-section" aria-labelledby="account-session-title">
                    <h3 id="account-session-title" data-str="accountSession"></h3>
                    <button type="button" class="account-btn danger" id="account-logout"><i class="bi bi-power" aria-hidden="true"></i> <span data-str="accountLogout"></span></button>
                </section>
            </div>
        </div>
    </div>

    <div class="logout-confirm-overlay" id="logout-confirm-overlay" hidden></div>
    <div class="logout-confirm" id="logout-confirm" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title" hidden>
        <h3 id="logout-confirm-title">Sair</h3>
        <p id="logout-confirm-message">Tem certeza que deseja sair?</p>
        <div class="logout-confirm-actions">
            <button type="button" id="logout-confirm-cancel" class="logout-confirm-cancel">Cancelar</button>
            <button type="button" id="logout-confirm-ok" class="logout-confirm-ok"><i class="bi bi-power"></i> Sair</button>
        </div>
    </div>

    <div class="logout-confirm-overlay" id="mod-confirm-overlay" hidden></div>
    <div class="logout-confirm" id="mod-confirm" role="dialog" aria-modal="true" aria-labelledby="mod-confirm-title" aria-describedby="mod-confirm-message" hidden>
        <h3 id="mod-confirm-title"></h3>
        <p id="mod-confirm-message"></p>
        <div class="logout-confirm-actions">
            <button type="button" id="mod-confirm-cancel" class="logout-confirm-cancel"></button>
            <button type="button" id="mod-confirm-ok" class="logout-confirm-ok"></button>
        </div>
    </div>

`;
  document.body.insertAdjacentHTML("afterbegin", markup);
  if (!document.getElementById("sidebar")) throw new Error("buildApp: layout injection failed");
})();

let me = null;
let selectedUser = null;
let pollInterval = null;
let lastMessageId = null;
const MESSAGE_PAGE_LIMIT = 50;
const NEAR_BOTTOM_THRESHOLD = 60;
const LOAD_OLDER_THRESHOLD = 80;
const OFFLINE_POLL_MS = 15000;            // DM message slow-check when recipient is offline
const UNREAD_ACTIVE_THRESHOLD_MS = 60000; // idle-after-this threshold for unread polling
const UNREAD_IDLE_POLL_MS = 30000;        // throttled unread interval when idle

let messageList = [];
let oldestLoadedId = null;
let noMoreOlder = false;
let loadingOlder = false;
let conversationEpoch = 0;
let pendingIdSeq = 0;
let typingDebounceTimer = null;
let lastTypingPost = 0;
let replyingTo = null;
let drawerOpen = false;

let social = {
  friendIds: new Set(),
  incoming: new Map(),
  outgoing: new Map(),
  friendSince: new Map(),
  unread: new Map(),
  friendsLoaded: false, // false until the friend list has loaded at least once
  friendsError: false,  // the last friend list request failed (after retries)
};
let searchTerm = "";
let profileExpanded = false;
let bubbleUser = null;
let usersCache = [];
let unreadInterval = null;
let unreadAudio = null;
let unreadInitialized = false;
let lastOfflineCheckAt = 0;
let lastUnreadFetchAt = 0;

let lastPresenceAt = 0;
let lastPresenceAnyFriendOnline = true; // default true so initial load fetch goes through

let audioRecorder = null;
let audioChunks = [];
let audioRecordStartTs = 0;
let audioRecordTimer = null;
let audioRecording = false;
let recordingIntent = false;
const MAX_AUDIO_MS = 5 * 60 * 1000;

let avatarEpoch = 0;

// ── Public rooms ────────────────────────────────────────────────────────
// A room reuses the DM panel (header, reply bar, message list, composer) in
// "room-mode". `currentRoom` and `selectedUser` are never both set.
const STRINGS = {
  bannedTitle: "Acesso bloqueado",
  bannedAll: "Você foi banido de todas as salas.",
  bannedOne: "Você foi banido da sala {room}.",
  bannedMany: "Você foi banido das salas {rooms}.",
  listAnd: " e ",
  roomEmpty: "Nenhuma mensagem nesta sala ainda.",
  roomDeleted: "Mensagem apagada",
  roomModBadge: "MOD",
  roomModBadgeLabel: "Moderador",
  roomBannedRow: "Você foi banido desta sala",
  roomSendFailed: "Falha ao enviar mensagem.",
  roomTooLong: "Mensagem muito longa (máx. 2000 caracteres).",
  roomReactFailed: "Falha ao reagir.",
  roomViewProfile: "Ver perfil de {name}",
  modMenuOpen: "Moderação",
  modLoading: "Carregando…",
  modDelete: "Apagar mensagem",
  modBanRoom: "Banir desta sala",
  modBanAll: "Banir de todas as salas",
  modUnban: "Remover ban",
  modBanTitle: "Banir usuário",
  modBanRoomConfirm: "Banir @{user} da sala {room}?",
  modBanAllConfirm: "Banir @{user} de todas as salas?",
  modBanOk: "Banir",
  modUnbanTitle: "Remover ban",
  modUnbanConfirm: "Remover todos os bans de @{user}?",
  modUnbanOk: "Remover ban",
  modCancel: "Cancelar",
  modBanned: "@{user} foi banido.",
  modUnbanned: "O ban de @{user} foi removido.",
  modFailed: "Não foi possível concluir a ação.",
  modForbidden: "Você não tem permissão para isso.",

  // Account dashboard ("Minha conta")
  accountOpen: "Minha conta",
  accountTitle: "Minha conta",
  accountClose: "Fechar",
  accountLoading: "Carregando…",
  accountLoadFailed: "Não foi possível carregar os dados da conta.",
  accountRetry: "Tentar novamente",
  accountUnknown: "—",
  accountProfile: "Perfil",
  accountAvatarChange: "Alterar foto de perfil",
  accountAvatarAdd: "Adicionar foto",
  accountAvatarEdit: "Alterar foto",
  accountShowname: "Nome de exibição",
  accountShownamePlaceholder: "Como quer ser chamado?",
  accountAdd: "Adicionar",
  accountEdit: "Editar",
  accountSave: "Salvar",
  accountCancel: "Cancelar",
  accountSaved: "Salvo",
  accountSaveFailed: "Erro ao salvar",
  accountMemberSince: "Membro desde",
  accountLastLogin: "Último login",
  accountDateTime: "{date} às {time}",
  accountFriends: "Amigos",
  accountEmail: "E-mail",
  emailNone: "Nenhum e-mail verificado",
  emailNoneNote: "Adicione um e-mail para poder recuperar sua senha se esquecer.",
  emailVerifiedBadge: "Verificado",
  emailAdd: "Adicionar e-mail",
  emailChange: "Alterar e-mail",
  emailRemove: "Remover e-mail",
  emailUnavailable: "Adicionar ou trocar o e-mail não está disponível no momento. O resto da sua conta funciona normalmente.",
  emailNewLabel: "Novo e-mail",
  emailSendCode: "Enviar código",
  emailInvalid: "Digite um e-mail válido.",
  emailSame: "Este já é o seu e-mail verificado.",
  emailCodeSent: "Enviamos uma mensagem para {email}. Digite o código de 6 dígitos que está nela. Ele vale por 10 minutos.",
  emailCodeLabel: "Código de verificação",
  emailConfirm: "Confirmar",
  emailResend: "Reenviar código",
  emailResendIn: "Reenviar código ({seconds}s)",
  emailResent: "Enviamos uma nova mensagem.",
  emailUseOther: "Usar outro e-mail",
  emailCodeInvalid: "Código inválido ou expirado.",
  emailVerified: "E-mail verificado.",
  emailRemoveNote: "Sem um e-mail verificado você não poderá recuperar sua senha. Digite sua senha atual para remover.",
  emailPasswordLabel: "Senha atual",
  emailPasswordNote: "Para proteger sua conta, adicionar ou trocar o e-mail pede a sua senha.",
  emailPasswordMissing: "Digite sua senha atual.",
  emailPasswordAgain: "Digite sua senha para enviar um novo código.",
  emailRemoveConfirm: "Remover",
  emailPasswordWrong: "Senha incorreta.",
  emailRemoved: "E-mail removido.",
  emailFailed: "Não foi possível concluir. Tente novamente.",
  accountRooms: "Salas",
  accountRole: "Função",
  roleUser: "Usuário",
  roleMod: "Moderador",
  roleOwner: "Dono",
  bansNone: "Você não está banido de nenhuma sala.",
  accountSession: "Sessão",
  accountLogout: "Sair da conta",

  // Name color (cosmetic)
  nameColor: "Cor do nome",
  nameColorNote: "Aparece na lista de usuários e nas salas.",
  nameColorDefault: "Padrão",
  nameColorPick: "Escolher cor",
  nameColorHexLabel: "Código da cor (hex)",
  nameColorReset: "Usar a cor padrão",
  nameColorTooDark: "Cor escura demais: fica ilegível no fundo escuro. Escolha uma mais clara.",
  nameColorInvalid: "Use o formato #RRGGBB.",
  nameColorSaved: "Cor salva.",
  nameColorFailed: "Não foi possível salvar a cor.",
  nameColorLocked: "Em breve: um item cosmético para desbloquear na loja.",

  // User popup (user list and room avatars)
  bubbleClose: "Fechar",
  bubbleCreated: "Conta criada em {date}",
  bubbleFriends: "Vocês são amigos",
  bubbleYou: "Este é você",
  bubbleGoToDms: "Ir para DMs",
  bubbleOpenAccount: "Minha conta",
  bubbleSendRequest: "Enviar solicitação de amizade",
  bubbleRequestSent: "Solicitação enviada",
  bubbleAccept: "Aceitar solicitação",
  bubbleDecline: "Recusar",
  bubbleIncoming: "Quer ser seu amigo",
  bubbleSendFailed: "Não foi possível enviar a solicitação.",
  bubbleFriendsFailed: "Não foi possível carregar seus amigos.",
  bubbleRetry: "Tentar novamente",
  bubbleLoading: "Carregando…",

  // Image preview popup (DMs, rooms, avatar)
  imgTitle: "Enviar imagem",
  imgTitleQueue: "Enviar imagem ({n} de {total})",
  imgAvatarTitle: "Foto de perfil",
  imgInfo: "{kb} KB · {w} × {h}",
  imgInfoGif: "GIF animado · {kb} KB",
  imgCrop: "Recortar",
  imgCancel: "Cancelar",
  imgSend: "Enviar",
  imgSave: "Salvar",
  imgSending: "Enviando… {p}%",
  imgApply: "Aplicar",
  imgReset: "Redefinir",
  imgCropFree: "Livre",
  imgCropArea: "Área de recorte",
  imgCropRatio: "Proporção do recorte",
  imgProcessing: "Processando imagem…",
  imgNotImage: "Apenas imagens são permitidas.",
  imgTooBig: "Imagem muito grande (máx. 15 MB).",
  imgGifTooBig: "GIF muito grande (máx. 1 MB).",
  imgDecodeFailed: "Não foi possível abrir esta imagem.",
  imgCompressFailed: "Não foi possível comprimir a imagem para menos de 1 MB.",
  imgServerTooBig: "A imagem passou do limite de 1 MB.",
  imgUnsupported: "Formato de imagem não suportado.",
  imgSendFailed: "Falha ao enviar a imagem. Tente novamente.",
};

const ROOM_POLL_MS = 2000;
const ROOM_MAX_LENGTH = 2000;
const ROOM_ICONS = { GLOBAL: "bi-globe2", POLITICS: "bi-bank", AKSHUALLY: "bi-eyeglasses" };
const ROOM_ICON_FALLBACK = "bi-hash";

let roomNames = [];                       // from the server (lib/rooms.js ROOMS)
let myBans = { all: false, rooms: [] };   // the caller's own bans; re-fetched on every room entry
let myRole = "user";
let currentRoom = null;
let roomMessages = [];
let roomEpoch = 0;
let roomLastId = null;
let roomOldestId = null;
let roomNoMoreOlder = false;
let roomLoadingOlder = false;
let roomPollInterval = null;
let roomPollBusyEpoch = -1;
let roomBanned = false;
let roomSending = false;
let modMenuSeq = 0;
let modConfirmResolve = null;

let contactPanelOpen = false;
let currentContact = null;

let activeContactTab = "info";
let currentMediaCache = [];

// Client token layer (defense-in-depth header auth)
let clientToken = null;
let clientTokenExpiry = 0;
let tokenRefreshPromise = null;

async function fetchHandshake() {
  const r = await fetch("/api/handshake", { credentials: "include" });
  if (!r.ok) throw new Error("handshake failed");
  const data = await r.json();
  if (!data.ok || !data.token) throw new Error("handshake missing token");
  clientToken = data.token;
  clientTokenExpiry = data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 14 * 60 * 1000;
  return clientToken;
}

async function ensureClientToken() {
  if (clientToken && Date.now() < clientTokenExpiry - 60000) return clientToken;
  if (tokenRefreshPromise) return tokenRefreshPromise;
  tokenRefreshPromise = fetchHandshake().finally(() => { tokenRefreshPromise = null; });
  return tokenRefreshPromise;
}

function clearClientToken() {
  clientToken = null;
  clientTokenExpiry = 0;
}

async function authFetch(url, options = {}) {
  const doFetch = async () => {
    const token = await ensureClientToken();
    const headers = new Headers(options.headers);
    headers.set("X-NAGORA-Token", token);
    return fetch(url, { ...options, headers });
  };

  let res = await doFetch();
  if (res.status === 401) {
    clearClientToken();
    try {
      res = await doFetch();
    } catch {
      location.href = "index.html";
      return new Response(null, { status: 401 });
    }
    if (res.status === 401) {
      location.href = "index.html";
      return new Response(null, { status: 401 });
    }
  }
  return res;
}

// /api/file and /api/avatar require the client token, which <img>/<audio> src
// cannot send — fetch them with authFetch and use blob URLs instead.
const mediaBlobCache = new Map();

function fetchMediaBlobUrl(url) {
  if (!mediaBlobCache.has(url)) {
    const p = authFetch(url, { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`media ${r.status}`);
        return r.blob();
      })
      .then(blob => URL.createObjectURL(blob))
      .catch(err => {
        mediaBlobCache.delete(url);
        throw err;
      });
    mediaBlobCache.set(url, p);
  }
  return mediaBlobCache.get(url);
}

// Lazy elements only fetch once they scroll near the viewport.
const lazyMediaObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        lazyMediaObserver.unobserve(entry.target);
        loadAuthedSrc(entry.target);
      }
    }, { rootMargin: "200px" })
  : null;

function setAuthedSrc(el, url, { lazy = false } = {}) {
  el.dataset.mediaUrl = url;
  if (lazy && lazyMediaObserver && !mediaBlobCache.has(url)) {
    lazyMediaObserver.observe(el);
    return;
  }
  loadAuthedSrc(el);
}

function loadAuthedSrc(el) {
  const url = el.dataset.mediaUrl;
  if (!url) return;
  fetchMediaBlobUrl(url)
    .then(blobUrl => {
      if (el.dataset.mediaUrl === url) el.src = blobUrl;
    })
    .catch(() => {
      if (el.dataset.mediaUrl === url) el.dispatchEvent(new Event("error"));
    });
}

function fileUrl(messageId) {
  return `/api/file?id=${encodeURIComponent(messageId)}`;
}

function roomImageUrl(messageId) {
  return `/api/rooms?type=image&id=${encodeURIComponent(messageId)}`;
}

const userList = document.getElementById("user-list");
const dmPlaceholder = document.getElementById("dm-placeholder");
const dmPanel = document.getElementById("dm-panel");
const dmUsername = document.getElementById("dm-username");
const dmStatus = document.getElementById("dm-status");
const dmTyping = document.getElementById("dm-typing");
const dmMessages = document.getElementById("dm-messages");
const dmInput = document.getElementById("dm-input");
const dmSend = document.getElementById("dm-send");
const dmAttach = document.getElementById("dm-attach");
const dmAttachMenu = document.getElementById("dm-attach-menu");
const dmImageInput = document.getElementById("dm-image-input");
const dmImageBtn = document.getElementById("dm-image-btn");
const dmAudioFileBtn = document.getElementById("dm-audio-file-btn");
const dmAudioInput = document.getElementById("dm-audio-input");
const dmVideoBtn = document.getElementById("dm-video-btn");
const dmVideoInput = document.getElementById("dm-video-input");
const dmUploadStatus = document.getElementById("dm-upload-status");
const dmEmojiBtn = document.getElementById("dm-emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");
const emojiPickerTabs = document.getElementById("emoji-picker-tabs");
const emojiPickerTitle = document.getElementById("emoji-picker-title");
const emojiPickerGrid = document.getElementById("emoji-picker-grid");
const dmReactBar = document.getElementById("dm-react-bar");
const dmLightbox = document.getElementById("dm-lightbox");
const dmLightboxImg = document.getElementById("dm-lightbox-img");
const dmLightboxClose = document.getElementById("dm-lightbox-close");
const dmLightboxPrev = document.getElementById("dm-lightbox-prev");
const dmLightboxNext = document.getElementById("dm-lightbox-next");
const dmLightboxThumbs = document.getElementById("dm-lightbox-thumbs");

let lightboxImageIndex = -1;
let lightboxImageSource = null;

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const menuBtn = document.getElementById("dm-menu-btn");
const placeholderMenuBtn = document.getElementById("dm-placeholder-menu-btn");
const replyBar = document.getElementById("dm-reply-bar");
const replyName = document.getElementById("dm-reply-name");
const replySnippet = document.getElementById("dm-reply-snippet");
const replyCancel = document.getElementById("dm-reply-cancel");

const searchToggle = document.getElementById("search-toggle");
const searchBox = document.getElementById("search-box");
const searchInput = document.getElementById("search-input");

const profileCard = document.getElementById("profile-card");
const profileSummary = document.getElementById("profile-summary");
const profileName = document.getElementById("profile-name");
const profilePfpBtn = document.getElementById("profile-pfp-btn");
const profileBody = document.getElementById("profile-body");
const profileBadge = document.getElementById("profile-badge");
const shownameInput = document.getElementById("showname-input");
const shownameSave = document.getElementById("showname-save");
const shownameEdit = document.getElementById("showname-edit");
const shownameCancel = document.getElementById("showname-cancel");
const shownameDisplay = document.getElementById("profile-showname-display");
const shownameValue = document.getElementById("profile-showname-value");
const shownameEditRow = document.getElementById("showname-edit-row");
const profileLogout = document.getElementById("profile-logout");
const profileMessage = document.getElementById("profile-message");
const profileRequests = document.getElementById("profile-requests");
const profileRequestsList = document.getElementById("profile-requests-list");

const logoutConfirmOverlay = document.getElementById("logout-confirm-overlay");
const logoutConfirm = document.getElementById("logout-confirm");
const logoutConfirmCancel = document.getElementById("logout-confirm-cancel");
const logoutConfirmOk = document.getElementById("logout-confirm-ok");

const roomList = document.getElementById("room-list");
const roomBan = document.getElementById("room-ban");
const roomBanTitle = document.getElementById("room-ban-title");
const roomBanMessage = document.getElementById("room-ban-message");
const roomModMenu = document.getElementById("room-mod-menu");
const modConfirmOverlay = document.getElementById("mod-confirm-overlay");
const modConfirm = document.getElementById("mod-confirm");
const modConfirmTitle = document.getElementById("mod-confirm-title");
const modConfirmMessage = document.getElementById("mod-confirm-message");
const modConfirmCancel = document.getElementById("mod-confirm-cancel");
const modConfirmOk = document.getElementById("mod-confirm-ok");

const imgPreviewOverlay = document.getElementById("img-preview-overlay");
const imgPreview = document.getElementById("img-preview");
const imgPreviewTitle = document.getElementById("img-preview-title");
const imgPreviewStage = document.getElementById("img-preview-stage");
const imgPreviewImg = document.getElementById("img-preview-img");
const imgCropWrap = document.getElementById("img-crop");
const imgCropCanvas = document.getElementById("img-crop-canvas");
const imgCropBox = document.getElementById("img-crop-box");
const imgPreviewInfo = document.getElementById("img-preview-info");
const imgCropPresets = document.getElementById("img-crop-presets");
const imgPreviewError = document.getElementById("img-preview-error");
const imgPreviewActions = document.getElementById("img-preview-actions");
const imgPreviewCrop = document.getElementById("img-preview-crop");
const imgPreviewCancel = document.getElementById("img-preview-cancel");
const imgPreviewSend = document.getElementById("img-preview-send");
const imgCropActions = document.getElementById("img-crop-actions");
const imgCropReset = document.getElementById("img-crop-reset");
const imgCropCancel = document.getElementById("img-crop-cancel");
const imgCropApply = document.getElementById("img-crop-apply");

const profileAccountBtn = document.getElementById("profile-account-btn");
const accountView = document.getElementById("account-view");
const accountScroll = document.getElementById("account-scroll");
const accountClose = document.getElementById("account-close");
const accountLoadError = document.getElementById("account-load-error");
const accountRetry = document.getElementById("account-retry");
const accountAvatar = document.getElementById("account-avatar");
const accountAvatarBtn = document.getElementById("account-avatar-btn");
const accountName = document.getElementById("account-name");
const accountHandle = document.getElementById("account-handle");
const accountShownameDisplay = document.getElementById("account-showname-display");
const accountShownameValue = document.getElementById("account-showname-value");
const accountShownameEdit = document.getElementById("account-showname-edit");
const accountShownameForm = document.getElementById("account-showname-form");
const accountShownameInput = document.getElementById("account-showname-input");
const accountShownameCancel = document.getElementById("account-showname-cancel");
const accountProfileMessage = document.getElementById("account-profile-message");
const accountNameColorLocked = document.getElementById("account-name-color-locked");
const accountNameColorEditor = document.getElementById("account-name-color-editor");
const accountNameColorSample = document.getElementById("account-name-color-sample");
const accountColorPicker = document.getElementById("account-color-picker");
const accountColorHex = document.getElementById("account-color-hex");
const accountColorSave = document.getElementById("account-color-save");
const accountColorReset = document.getElementById("account-color-reset");
const accountColorMessage = document.getElementById("account-color-message");
const accountMemberSince = document.getElementById("account-member-since");
const accountLastLogin = document.getElementById("account-last-login");
const accountFriends = document.getElementById("account-friends");
const accountEmailUnavailable = document.getElementById("account-email-unavailable");
const accountEmailCurrent = document.getElementById("account-email-current");
const accountEmailValue = document.getElementById("account-email-value");
const accountEmailBadge = document.getElementById("account-email-badge");
const accountEmailNoneNote = document.getElementById("account-email-none-note");
const accountEmailAdd = document.getElementById("account-email-add");
const accountEmailRemove = document.getElementById("account-email-remove");
const accountEmailForm = document.getElementById("account-email-form");
const accountEmailInput = document.getElementById("account-email-input");
const accountEmailUsername = document.getElementById("account-email-username");
const accountEmailPassword = document.getElementById("account-email-password");
const accountEmailSend = document.getElementById("account-email-send");
const accountEmailFormCancel = document.getElementById("account-email-form-cancel");
const accountCodeForm = document.getElementById("account-code-form");
const accountCodeSent = document.getElementById("account-code-sent");
const accountCodeInput = document.getElementById("account-code-input");
const accountCodeSubmit = document.getElementById("account-code-submit");
const accountCodeResend = document.getElementById("account-code-resend");
const accountCodeOther = document.getElementById("account-code-other");
const accountRemoveForm = document.getElementById("account-remove-form");
const accountRemoveUsername = document.getElementById("account-remove-username");
const accountRemovePassword = document.getElementById("account-remove-password");
const accountRemoveSubmit = document.getElementById("account-remove-submit");
const accountRemoveCancel = document.getElementById("account-remove-cancel");
const accountEmailMessage = document.getElementById("account-email-message");
const accountRole = document.getElementById("account-role");
const accountBans = document.getElementById("account-bans");
const accountLogout = document.getElementById("account-logout");

const userBubble = document.getElementById("user-bubble");
const userBubbleClose = document.getElementById("user-bubble-close");
const userBubbleName = document.getElementById("user-bubble-name");
const userBubbleHandle = document.getElementById("user-bubble-handle");
const userBubbleActions = document.getElementById("user-bubble-actions");
const userBubbleAvatar = document.getElementById("user-bubble-avatar");
const userBubbleCreated = document.getElementById("user-bubble-created");
const userBubbleFriend = document.getElementById("user-bubble-friend");
const userBubbleFriendText = document.getElementById("user-bubble-friend-text");

const dmAudio = document.getElementById("dm-audio");
const profileIcon = document.querySelector(".profile-icon");
const profileAvatar = document.querySelector(".profile-avatar");
const profileAvatarInput = document.getElementById("profile-avatar-input");
const dmHeader = document.getElementById("dm-header");
const dmHeaderAvatar = document.getElementById("dm-header-avatar");
const contactPanel = document.getElementById("contact-panel");
const contactPanelOverlay = document.getElementById("contact-panel-overlay");
const contactPanelClose = document.getElementById("contact-panel-close");
const contactPanelAvatar = document.getElementById("contact-panel-avatar");
const contactName = document.getElementById("contact-name");
const contactHandle = document.getElementById("contact-handle");
const contactStatus = document.getElementById("contact-status");
const contactLastSeen = document.getElementById("contact-last-seen");
const contactTabInfo = document.getElementById("contact-tab-info");
const contactTabMedia = document.getElementById("contact-tab-media");
const contactTabInfoPanel = document.getElementById("contact-tab-info-panel");
const contactTabMediaPanel = document.getElementById("contact-tab-media-panel");
const contactInfoList = document.getElementById("contact-info-list");
const contactAccountCreatedRow = document.getElementById("contact-account-created");
const contactAccountCreatedValue = document.getElementById("contact-account-created-value");
const contactFriendsSinceRow = document.getElementById("contact-friends-since");
const contactFriendsSinceValue = document.getElementById("contact-friends-since-value");
const contactFirstConversationRow = document.getElementById("contact-first-conversation");
const contactFirstConversationValue = document.getElementById("contact-first-conversation-value");
const contactPanelUnfriend = document.getElementById("contact-panel-unfriend");
const contactMediaImages = document.getElementById("contact-media-images");
const contactMediaAudios = document.getElementById("contact-media-audios");
const contactMediaEmpty = document.getElementById("contact-media-empty");
const contactMediaImagesSection = document.getElementById("contact-media-images-section");
const contactMediaAudioSection = document.getElementById("contact-media-audio-section");
const contactMediaVideos = document.getElementById("contact-media-videos");
const contactMediaVideoSection = document.getElementById("contact-media-video-section");

const URL_RE = /https:\/\/[^\s<>"{}|\\^`\[\]]+/g;

function displayName(u) {
  return u.showname || u.username;
}

// Presence: "online" | "away" (idle ≥ 90s, app open) | "offline".
const STATUS_LABELS = { online: "online", away: "ausente", offline: "offline" };

function userStatus(u) {
  return u?.status || (u?.online ? "online" : "offline");
}

function amAway() {
  return !!window.__NAGORA_ACTIVITY__?.away;
}

function trackAppActivity(type) {
  if (window.__NAGORA_ACTIVITY__?.track) {
    window.__NAGORA_ACTIVITY__.track(type);
  }
}

function avatarUrl(userId, hasAvatar) {
  if (!hasAvatar) return null;
  return `/api/avatar?userId=${encodeURIComponent(userId)}&v=${avatarEpoch}`;
}

function setAvatarOrFallback(container, userId, hasAvatar, imgClass) {
  container.innerHTML = "";
  if (!hasAvatar) {
    container.innerHTML = '<i class="bi bi-person-circle"></i>';
    return;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.className = imgClass;
  img.onerror = () => { container.innerHTML = '<i class="bi bi-person-circle"></i>'; };
  setAuthedSrc(img, avatarUrl(userId, true));
  container.appendChild(img);
}

async function answerRequest(targetUserId, action) {
  try {
    const r = await authFetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, targetUserId }),
    });
    if (!r.ok) throw new Error(`${action} failed`);
    await fetchSocial();
    await fetchIncomingBadge();
    trackAppActivity(action === "accept" ? "friend_request_accept" : "friend_request_decline");
    return true;
  } catch (e) {
    console.warn(`[app] ${action} request:`, e);
    return false;
  }
}

function appendLinkifiedText(text, parent) {
  let lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) parent.appendChild(document.createTextNode(before));

    let url = match[0].replace(/[.,;:!?]+$/, "");
    if (url.endsWith(")")) url = url.slice(0, -1);

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "dm-link";
    a.textContent = url;
    parent.appendChild(a);

    lastIndex = match.index + match[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail) parent.appendChild(document.createTextNode(tail));
}

async function initSession() {
  try {
    const r = await fetch("/api/handshake", { credentials: "include" });
    if (!r.ok) {
      location.href = "index.html";
      return;
    }
    const data = await r.json();
    if (!data.ok || !data.token) {
      location.href = "index.html";
      return;
    }
    me = {
      username: data.username,
      userId: data.userId,
      showname: data.showname || null,
      hasAvatar: data.hasAvatar || false,
      nameColor: data.nameColor || null,
      nameColorAllowed: !!data.nameColorAllowed,
    };
    setMyRoomState(data);
    clientToken = data.token;
    clientTokenExpiry = data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 14 * 60 * 1000;
  } catch (e) {
    console.warn("[app] initSession:", e);
    location.href = "index.html";
  }
}

const FRIENDS_RETRY_DELAYS_MS = [400, 1200];

// The friend list decides whether a contact opens a chat or a "send request"
// prompt, so a failed request is retried and never treated as "no friends".
async function fetchFriendList() {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await authFetch("/api/friends?type=friends", { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.users)) return data.users;
      }
    } catch (e) {
      console.warn("[app] friends fetch:", e);
    }
    if (attempt >= FRIENDS_RETRY_DELAYS_MS.length) return null;
    await new Promise(resolve => setTimeout(resolve, FRIENDS_RETRY_DELAYS_MS[attempt]));
  }
}

async function fetchSocial() {
  if (!me) return;
  try {
    const [usersRes, friends, incomingRes, outgoingRes] = await Promise.all([
      authFetch("/api/users", { credentials: "include" }),
      fetchFriendList(),
      authFetch("/api/friends?type=incoming", { credentials: "include" }),
      authFetch("/api/friends?type=outgoing", { credentials: "include" }),
    ]);

    // On failure the previous friend set is kept; the UI shows an error state
    // only when no friend list has ever loaded.
    if (friends) {
      social.friendIds = new Set(friends.map(u => u.userId));
      social.friendSince = new Map(friends.map(u => [u.userId, u.friendsSince]));
      social.friendsLoaded = true;
      social.friendsError = false;
    } else {
      social.friendsError = true;
      console.warn("[app] fetchSocial: friend list unavailable");
    }

    if (!usersRes.ok) {
      renderUsers(usersCache);
      throw new Error("users fetch failed");
    }
    const { users } = await usersRes.json();
    usersCache = users || [];
    if (incomingRes.ok) {
      const { requests } = await incomingRes.json();
      social.incoming = new Map((requests || []).map(r => [r.senderId, r]));
    }
    if (outgoingRes.ok) {
      const { requests } = await outgoingRes.json();
      social.outgoing = new Map((requests || []).map(r => [r.recipientId, r]));
    }

    renderUsers(usersCache);
    renderProfileBadge();
    renderIncomingRequests();
    if (bubbleUser) renderBubble();
  } catch (e) {
    console.warn("[app] fetchSocial:", e);
  }
}

async function fetchIncomingBadge() {
  if (!me) return;
  try {
    const r = await authFetch("/api/friends?type=incoming", { credentials: "include" });
    if (!r.ok) return;
    const { requests } = await r.json();
    social.incoming = new Map((requests || []).map(req => [req.senderId, req]));
    renderProfileBadge();
    renderIncomingRequests();
    if (bubbleUser) renderBubble();
  } catch (e) {
    console.warn("[app] fetchIncomingBadge:", e);
  }
}

function unreadMapsDiffer(a, b) {
  if (a.size !== b.size) return true;
  for (const [key, val] of b) {
    const av = a.get(key);
    if (!av || av.count !== val.count) return true;
  }
  return false;
}

async function fetchUnread({ force = false } = {}) {
  if (!me) return;

  const now = Date.now();
  const idleFor = now - (window.__NAGORA_ACTIVITY__?.lastActivityAt || 0);
  const isIdle = idleFor > UNREAD_ACTIVE_THRESHOLD_MS;

  // Gate: when active, only poll if at least one friend is online.
  // When idle, fall back to the existing idle throttle so unread is still caught up.
  if (!force && !isIdle && !lastPresenceAnyFriendOnline) {
    return;
  }

  // Gate: throttle unread polling when the user has been idle.
  if (!force && isIdle && now - lastUnreadFetchAt < UNREAD_IDLE_POLL_MS) {
    return;
  }
  lastUnreadFetchAt = now;

  try {
    const r = await authFetch("/api/unread", { credentials: "include" });
    if (!r.ok) throw new Error("unread fetch failed");
    const data = await r.json();
    const conversations = data.conversations || [];

    const newUnread = new Map(
      conversations.map(c => [c.senderId, { count: c.unreadCount, latestAt: c.latestMessageAt }])
    );

    if (unreadInitialized) {
      for (const [senderId, { count }] of newUnread) {
        const prev = social.unread.get(senderId);
        const prevCount = prev ? prev.count : 0;
        if (count > prevCount && (senderId !== selectedUser?.userId || amAway())) {
          playNotificationSound();
          break;
        }
      }
    }

    const changed = unreadMapsDiffer(social.unread, newUnread);
    social.unread = newUnread;
    unreadInitialized = true;
    if (changed) {
      renderUsers(usersCache);
    }
    updateTitle();
  } catch (e) {
    console.warn("[app] fetchUnread:", e);
  }
}

function playNotificationSound() {
  if (!unreadAudio) {
    unreadAudio = new Audio("sounds/notif.mp3");
  }
  unreadAudio.currentTime = 0;
  unreadAudio.play().catch(() => {});
}

function updateTitle() {
  let total = 0;
  for (const { count } of social.unread.values()) {
    total += count;
  }
  document.title = total > 0 ? `(${total}) NAGORA` : "NAGORA";
}

function renderUsers(users) {
  userList.innerHTML = "";

  if (social.friendsError && !social.friendsLoaded) {
    const notice = document.createElement("button");
    notice.type = "button";
    notice.className = "user-list-error";
    notice.textContent = "Não foi possível carregar seus amigos. Toque para tentar novamente.";
    notice.addEventListener("click", () => {
      notice.disabled = true;
      fetchSocial();
    });
    userList.appendChild(notice);
  }

  const filtered = (users || []).filter(u => {
    if (u.userId === me?.userId) return false;
    if (!searchTerm) return true;
    return u.username.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (searchTerm && !filtered.length) {
    const none = document.createElement("div");
    none.className = "user-row no-results";
    none.textContent = "Nenhum usuário encontrado";
    userList.appendChild(none);
    return;
  }

  if (!searchTerm) {
    filtered.sort((a, b) => {
      const aUnread = social.unread.get(a.userId);
      const bUnread = social.unread.get(b.userId);
      const aCount = aUnread ? aUnread.count : 0;
      const bCount = bUnread ? bUnread.count : 0;

      if (aCount > 0 || bCount > 0) {
        if (aCount === 0) return 1;
        if (bCount === 0) return -1;
        const aLatest = aUnread?.latestAt ? new Date(aUnread.latestAt) : new Date(0);
        const bLatest = bUnread?.latestAt ? new Date(bUnread.latestAt) : new Date(0);
        return bLatest - aLatest;
      }

      const aFriend = social.friendIds.has(a.userId);
      const bFriend = social.friendIds.has(b.userId);
      if (aFriend || bFriend) {
        if (!aFriend) return 1;
        if (!bFriend) return -1;
        const aSince = social.friendSince.get(a.userId) ? new Date(social.friendSince.get(a.userId)) : new Date(0);
        const bSince = social.friendSince.get(b.userId) ? new Date(social.friendSince.get(b.userId)) : new Date(0);
        return aSince - bSince;
      }

      return a.username.localeCompare(b.username);
    });
  }

  for (const u of filtered) {
    const row = document.createElement("div");
    row.className = "user-row";
    row.dataset.username = u.username;
    row.dataset.userid = u.userId;

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "user-row-avatar";
    setAvatarOrFallback(avatarWrap, u.userId, u.hasAvatar, "");

    const dot = document.createElement("span");
    dot.className = `status-dot ${userStatus(u)}`;
    dot.title = STATUS_LABELS[userStatus(u)];

    const name = document.createElement("span");
    name.className = "username";
    name.textContent = displayName(u);
    applyNameColor(name, u.nameColor);

    row.appendChild(avatarWrap);
    row.appendChild(dot);
    row.appendChild(name);

    const unreadInfo = social.unread.get(u.userId);
    const unreadCount = unreadInfo ? unreadInfo.count : 0;
    if (unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "user-unread-badge";
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badge.setAttribute("aria-label", `${unreadCount} mensagens não lidas`);
      row.appendChild(badge);
    }

    if (u.userId) {
      row.addEventListener("click", () => handleUserRowClick(u));
    }

    userList.appendChild(row);
  }

  if (selectedUser?.userId) {
    for (const el of userList.querySelectorAll(".user-row")) {
      if (el.dataset.userid === selectedUser.userId) {
        el.classList.add("active");
      }
    }
  }
}

function handleUserRowClick(user) {
  if (social.friendIds.has(user.userId)) {
    selectUser(user);
  } else {
    openBubble(user);
  }
}

function setInitialLoading(show) {
  if (!dmMessages) return;
  const existing = dmMessages.querySelector(".dm-initial-loader");
  if (!show) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  const loader = document.createElement("div");
  loader.className = "dm-initial-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    loader.appendChild(dot);
  }
  const sr = document.createElement("span");
  sr.className = "dm-sr-only";
  sr.textContent = "Carregando mensagens";
  loader.appendChild(sr);
  dmMessages.appendChild(loader);
}

async function selectUser(user) {
  if (!user) return;
  trackAppActivity("open_conversation");
  if (imgTarget && imgTarget.kind !== "avatar") closeImagePreview({ all: true });
  closeBubble();
  closeReactBar();
  closeEmojiPicker();
  leaveRoom();
  for (const el of userList.querySelectorAll(".user-row")) {
    el.classList.remove("active");
  }
  const row = userList.querySelector(`.user-row[data-userid="${user.userId}"]`);
  if (row) row.classList.add("active");

  selectedUser = user;
  dmPlaceholder.hidden = true;
  dmPanel.hidden = false;
  dmUsername.textContent = displayName(user);
  dmUsername.dataset.userid = user.userId;
  setAvatarOrFallback(dmHeaderAvatar, user.userId, user.hasAvatar, "avatar-img");
  dmStatus.className = `status-dot ${userStatus(user)}`;
  dmTyping.textContent = "";
  dmMessages.innerHTML = "";
  dmMessages.classList.remove("loading-older");
  setInitialLoading(true);

  messageList = [];
  oldestLoadedId = null;
  noMoreOlder = false;
  loadingOlder = false;
  lastMessageId = null;
  conversationEpoch++;

  social.unread.delete(user.userId);
  renderUsers(usersCache);
  updateTitle();

  markRead(user.userId).finally(fetchUnread);
  stopPoll();
  lastOfflineCheckAt = 0;
  await pollConversation();
  startPoll();
  closeDrawer();
}

function openDrawer() {
  sidebar.classList.add("open");
  sidebarOverlay.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
  menuBtn.setAttribute("aria-label", "Fechar lista de usuários");
  drawerOpen = true;
  fetchSocial(); fetchIncomingBadge();
  const activeRow = userList.querySelector(".user-row.active");
  (activeRow || userList.querySelector(".user-row"))?.focus();
}

function closeDrawer() {
  sidebar.classList.remove("open");
  sidebarOverlay.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-label", "Abrir lista de usuários");
  drawerOpen = false;
  if (!dmPanel.hidden) {
    menuBtn.focus();
  } else {
    placeholderMenuBtn?.focus();
  }
}

menuBtn.addEventListener("click", () => {
  if (drawerOpen) closeDrawer(); else openDrawer();
});
placeholderMenuBtn.addEventListener("click", openDrawer);

sidebarOverlay.addEventListener("click", closeDrawer);

async function markRead(userId) {
  try {
    await authFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "read", with: userId }),
    });
  } catch (e) {
    console.warn("[app] markRead:", e);
  }
}

function snippet(replyTo) {
  if (replyTo.deleted) return STRINGS.roomDeleted;
  if (replyTo.content) {
    return replyTo.content.length > 80
      ? replyTo.content.slice(0, 80) + "…"
      : replyTo.content;
  }
  if (replyTo.mediaType?.startsWith("image/")) return "(imagem)";
  if (replyTo.mediaType?.startsWith("audio/")) return "(áudio)";
  if (replyTo.mediaType?.startsWith("video/")) return "(vídeo)";
  return "(mídia)";
}

function setReply(message) {
  let senderUsername;
  if (message.senderId === me.userId) {
    senderUsername = displayName(me);
  } else if (selectedUser && selectedUser.userId === message.senderId) {
    senderUsername = displayName(selectedUser);
  } else {
    senderUsername = message.senderUsername || message.senderId;
  }
  replyingTo = {
    id: message.id,
    senderId: message.senderId,
    senderUsername,
    content: message.content,
    mediaType: message.mediaType,
  };
  renderReplyBar();
  dmInput.focus();
}

function clearReply() {
  replyingTo = null;
  renderReplyBar();
}

function renderReplyBar() {
  if (!replyingTo) {
    replyBar.hidden = true;
    return;
  }
  replyName.textContent = replyingTo.senderUsername;
  replySnippet.textContent = snippet(replyingTo);
  replyBar.hidden = false;
}

function jumpToMessage(id) {
  const target = dmMessages.querySelector(`.dm-bubble[data-id="${id}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("dm-bubble-highlight");
  setTimeout(() => target.classList.remove("dm-bubble-highlight"), 1500);
}

function createImageBubble(url) {
  const wrap = document.createElement("div");
  wrap.className = "dm-media-wrap";

  const img = document.createElement("img");
  img.alt = "Imagem";

  const spinner = document.createElement("div");
  spinner.className = "dm-image-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const error = document.createElement("div");
  error.className = "dm-image-error";
  error.textContent = "Falha ao carregar imagem";

  function reveal() {
    wrap.classList.add("loaded");
  }

  function onError() {
    wrap.classList.add("error");
  }

  img.addEventListener("load", reveal);
  img.addEventListener("error", onError);
  setAuthedSrc(img, url, { lazy: true });

  wrap.appendChild(spinner);
  wrap.appendChild(error);
  wrap.appendChild(img);
  return wrap;
}

function createAudioBubble(message) {
  const wrap = document.createElement("div");
  wrap.className = "dm-audio-wrap";
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "metadata";
  setAuthedSrc(audio, fileUrl(message.id), { lazy: true });
  const duration = document.createElement("span");
  duration.className = "dm-audio-duration";
  duration.textContent = message.mediaDurationMs ? formatAudioDuration(message.mediaDurationMs) : "0:00";
  wrap.appendChild(audio);
  wrap.appendChild(duration);
  return wrap;
}

// ── Video ───────────────────────────────────────────────────────────────
// Vercel serverless has no ffmpeg, so videos are re-encoded in the browser:
// the file plays into a ≤480p canvas that MediaRecorder encodes (H.264/MP4
// where supported — plays everywhere — else VP9/VP8 WebM). Files already
// ≤480p at a sane bitrate are sent untouched. Uploads go in chunks and
// downloads in 4 MB parts because Vercel caps bodies at 4.5 MB.
const VIDEO_MAX_SHORT_SIDE = 480;
const VIDEO_MAX_LONG_SIDE = 854;
const VIDEO_MAX_DURATION_MS = 3 * 60 * 1000;
const VIDEO_MAX_BYTES = 16 * 1024 * 1024;
const VIDEO_BITRATE = 700000;
const VIDEO_AUDIO_BITRATE = 64000;
const VIDEO_UPLOAD_CHUNK_BYTES = 2.5 * 1024 * 1024;
const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function setUploadStatus(text) {
  dmUploadStatus.textContent = text || "";
  dmUploadStatus.hidden = !text;
}

function fitVideoSize(w, h) {
  const scale = Math.min(1, VIDEO_MAX_SHORT_SIDE / Math.min(w, h), VIDEO_MAX_LONG_SIDE / Math.max(w, h));
  const even = n => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(w), height: even(h) };
}

function waitForEvent(target, name) {
  return new Promise(resolve => target.addEventListener(name, resolve, { once: true }));
}

async function compressVideo(file, onProgress) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  // Attached (but invisible) so browsers keep decoding frames for the canvas.
  video.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;";
  video.playsInline = true;
  video.preload = "auto";
  document.body.appendChild(video);

  let audioCtx = null;
  try {
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Formato de vídeo não suportado."));
    });

    // Browser-recorded WebM often has no duration header (Infinity) until seeked to the end.
    if (video.duration === Infinity) {
      video.currentTime = 1e9;
      await waitForEvent(video, "seeked");
    }

    const durationMs = Math.round(video.duration * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Formato de vídeo não suportado.");
    if (durationMs > VIDEO_MAX_DURATION_MS) throw new Error("Vídeo muito longo (máx. 3 min).");

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const { width, height } = fitVideoSize(srcW, srcH);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    video.currentTime = Math.min(0.1, video.duration / 2);
    await waitForEvent(video, "seeked");
    ctx.drawImage(video, 0, 0, width, height);
    const thumbBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

    const bitrate = (file.size * 8) / (durationMs / 1000);
    const passthrough = /^video\/(mp4|webm)$/.test(file.type)
      && Math.min(srcW, srcH) <= VIDEO_MAX_SHORT_SIDE
      && Math.max(srcW, srcH) <= VIDEO_MAX_LONG_SIDE
      && bitrate <= VIDEO_BITRATE * 1.5
      && file.size <= VIDEO_MAX_BYTES;
    if (passthrough) {
      return { blob: file, mimeType: file.type, width: srcW, height: srcH, durationMs, thumbBase64 };
    }

    const recorderType = window.MediaRecorder && canvas.captureStream
      ? VIDEO_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t))
      : null;
    if (!recorderType) throw new Error("Seu navegador não suporta compressão de vídeo.");
    const mimeType = recorderType.split(";")[0];

    const stream = canvas.captureStream(30);
    try {
      // resume() never settles without a prior user gesture — cap the wait and
      // send the video without sound rather than hang.
      audioCtx = new AudioContext();
      await Promise.race([audioCtx.resume(), new Promise(r => setTimeout(r, 1000))]);
      if (audioCtx.state === "running") {
        const dest = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaElementSource(video).connect(dest);
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
      }
    } catch {
      // No Web Audio — the video is sent without sound.
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: recorderType,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: VIDEO_AUDIO_BITRATE,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = waitForEvent(recorder, "stop");

    video.currentTime = 0;
    await waitForEvent(video, "seeked");

    // A plain 30 fps timer: rAF / requestVideoFrameCallback get throttled to a
    // few fps in occluded windows and stop entirely in background tabs.
    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      ctx.drawImage(video, 0, 0, width, height);
      onProgress?.(video.currentTime / video.duration);
      setTimeout(draw, 1000 / 30);
    };

    const ended = waitForEvent(video, "ended");
    recorder.start(1000);
    try {
      await video.play();
    } catch {
      video.muted = true;
      await video.play();
    }
    draw();
    await ended;
    drawing = false;
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size > VIDEO_MAX_BYTES) throw new Error("Vídeo muito grande (máx. 16 MB após compressão).");
    return { blob, mimeType, width, height, durationMs, thumbBase64 };
  } finally {
    audioCtx?.close().catch(() => {});
    video.remove();
    URL.revokeObjectURL(url);
  }
}

async function postFileJson(body) {
  const r = await authFetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "upload failed");
  return data;
}

async function uploadVideo(result, { recipient, replyTo }, onProgress) {
  const { blob } = result;
  let uploadId = null;
  for (let offset = 0; offset < blob.size; offset += VIDEO_UPLOAD_CHUNK_BYTES) {
    const chunkBase64 = await fileToBase64(blob.slice(offset, offset + VIDEO_UPLOAD_CHUNK_BYTES));
    const data = await postFileJson({ action: "videoChunk", uploadId, chunkBase64 });
    uploadId = data.uploadId;
    onProgress?.(Math.min(1, (offset + VIDEO_UPLOAD_CHUNK_BYTES) / blob.size));
  }

  await postFileJson({
    action: "videoFinish",
    uploadId,
    recipientUserId: recipient.userId,
    mediaType: result.mimeType,
    width: result.width,
    height: result.height,
    durationMs: result.durationMs,
    thumbBase64: result.thumbBase64,
    replyToId: replyTo?.id,
  });
  if (replyTo && replyingTo === replyTo) clearReply();
  trackAppActivity("send_media");
  if (selectedUser?.userId === recipient.userId) await pollConversation();
}

let videoUploadBusy = false;

async function sendVideoFile(file) {
  if (!file || !selectedUser) return;
  if (!file.type.startsWith("video/")) {
    showImageError("Apenas vídeos são permitidos.");
    return;
  }
  if (videoUploadBusy) {
    showImageError("Aguarde o vídeo anterior terminar.");
    return;
  }

  // Compression can take as long as the video; pin the target conversation now.
  const target = { recipient: selectedUser, replyTo: replyingTo };
  videoUploadBusy = true;
  try {
    setUploadStatus("Processando vídeo…");
    const result = await compressVideo(file, (p) => {
      setUploadStatus(`Processando vídeo… ${Math.round(p * 100)}% (mantenha esta aba aberta)`);
    });
    setUploadStatus("Enviando vídeo…");
    await uploadVideo(result, target, (p) => setUploadStatus(`Enviando vídeo… ${Math.round(p * 100)}%`));
  } catch (e) {
    console.warn("[app] video upload:", e);
    showImageError(e.message || "Falha ao enviar vídeo.");
  } finally {
    videoUploadBusy = false;
    setUploadStatus("");
  }
}

function fetchVideoBlobUrl(message) {
  const key = `${fileUrl(message.id)}&video=1`;
  if (!mediaBlobCache.has(key)) {
    const p = (async () => {
      const first = await authFetch(`${fileUrl(message.id)}&part=0`, { credentials: "include" });
      if (!first.ok) throw new Error(`video ${first.status}`);
      const parts = Number(first.headers.get("X-Media-Parts")) || 1;
      const blobs = [await first.blob()];
      for (let i = 1; i < parts; i++) {
        const r = await authFetch(`${fileUrl(message.id)}&part=${i}`, { credentials: "include" });
        if (!r.ok) throw new Error(`video ${r.status}`);
        blobs.push(await r.blob());
      }
      return URL.createObjectURL(new Blob(blobs, { type: message.mediaType }));
    })().catch(err => {
      mediaBlobCache.delete(key);
      throw err;
    });
    mediaBlobCache.set(key, p);
  }
  return mediaBlobCache.get(key);
}

/** Thumbnail + play button; the video itself is only downloaded on click. */
function createVideoBubble(message) {
  const wrap = document.createElement("div");
  wrap.className = "dm-media-wrap dm-video-wrap";
  if (message.mediaWidth && message.mediaHeight) {
    wrap.style.aspectRatio = `${message.mediaWidth} / ${message.mediaHeight}`;
  }

  const thumb = document.createElement("img");
  thumb.alt = "Vídeo";
  thumb.addEventListener("load", () => wrap.classList.add("loaded"));
  thumb.addEventListener("error", () => wrap.classList.add("loaded", "no-thumb"));
  setAuthedSrc(thumb, `${fileUrl(message.id)}&thumb=1`, { lazy: true });

  const spinner = document.createElement("div");
  spinner.className = "dm-image-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const error = document.createElement("div");
  error.className = "dm-image-error";
  error.textContent = "Falha ao carregar vídeo";

  const play = document.createElement("button");
  play.type = "button";
  play.className = "dm-video-play";
  play.setAttribute("aria-label", "Reproduzir vídeo");
  play.innerHTML = '<i class="bi bi-play-fill"></i>';

  const duration = document.createElement("span");
  duration.className = "dm-video-duration";
  duration.textContent = message.mediaDurationMs ? formatAudioDuration(message.mediaDurationMs) : "";

  play.addEventListener("click", async (e) => {
    e.stopPropagation();
    wrap.classList.add("loading");
    try {
      const blobUrl = await fetchVideoBlobUrl(message);
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.src = blobUrl;
      wrap.replaceChildren(video);
      wrap.classList.remove("loading");
      wrap.classList.add("playing");
      video.play().catch(() => {});
    } catch (err) {
      console.warn("[app] video load:", err);
      wrap.classList.remove("loading");
      wrap.classList.add("error");
    }
  });

  wrap.append(spinner, error, thumb, play, duration);
  return wrap;
}

// ── Emoji ───────────────────────────────────────────────────────────────
// One picker serves both the composer (desktop-only button, stays open for
// several inserts) and message reactions (closes after one pick).
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EMOJI_RECENT_KEY = "ngr-emoji-recent";
const EMOJI_RECENT_MAX = 24;
const EMOJI_CATEGORIES = [
  { id: "recent", label: "Recentes", icon: "bi-clock", emojis: [] },
  { id: "smileys", label: "Smileys e pessoas", icon: "bi-emoji-smile", emojis: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊 👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 👀 👁️ 👅 👄 💋 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 👷 🤴 👸 👳 👲 🧕 🤵 👰 🤰 🤱 👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🧍 🧎 🏃 💃 🕺 👯 🧖 👫 👭 👬 💏 💑 👪" },
  { id: "nature", label: "Animais e natureza", icon: "bi-tree", emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐀 🐿️ 🦔 🐾 🐉 🐲 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🎋 🍃 🍂 🍁 🍄 🐚 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 ☔ ☂️ 🌊" },
  { id: "food", label: "Comidas e bebidas", icon: "bi-cup-straw", emojis: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️ 🥣 🥡 🥢 🧂" },
  { id: "activities", label: "Atividades", icon: "bi-trophy", emojis: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩 🎉 🎊 🎈 🎁 🎀 🎃 🎆 🎇 🧨" },
  { id: "travel", label: "Viagens e lugares", icon: "bi-geo-alt", emojis: "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🚏 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🗾 🎑 🏞️ 🌅 🌄 🌠 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁" },
  { id: "objects", label: "Objetos", icon: "bi-lightbulb", emojis: "⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 🕹️ 🗜️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🧺 🧻 🚽 🚰 🚿 🛁 🛀 🧼 🪒 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🛌 🧸 🖼️ 🛍️ 🛒 🎏 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓" },
  { id: "symbols", label: "Símbolos", icon: "bi-heart", emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ ☢️ ☣️ 📴 📳 ✴️ 🆚 💮 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 🚻 🚮 🎦 📶 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄" },
  { id: "flags", label: "Bandeiras", icon: "bi-flag", emojis: "🇧🇷 🇵🇹 🇦🇴 🇲🇿 🇨🇻 🇺🇸 🇬🇧 🇦🇷 🇨🇱 🇺🇾 🇵🇾 🇧🇴 🇵🇪 🇨🇴 🇻🇪 🇪🇨 🇲🇽 🇨🇦 🇪🇸 🇫🇷 🇩🇪 🇮🇹 🇳🇱 🇧🇪 🇨🇭 🇦🇹 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇮🇪 🇵🇱 🇺🇦 🇷🇺 🇹🇷 🇬🇷 🇮🇱 🇪🇬 🇿🇦 🇳🇬 🇯🇵 🇰🇷 🇨🇳 🇮🇳 🇦🇺 🇳🇿 🇪🇺 🇺🇳 🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️" },
];
for (const c of EMOJI_CATEGORIES) {
  if (typeof c.emojis === "string") c.emojis = c.emojis.split(" ");
}

let emojiPickerMode = null; // "compose" | "react"
let emojiPickerOnPick = null;
let emojiPickerCategory = null;

function loadRecentEmojis() {
  try {
    const list = JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter(e => typeof e === "string").slice(0, EMOJI_RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberEmoji(emoji) {
  const next = [emoji, ...loadRecentEmojis().filter(e => e !== emoji)].slice(0, EMOJI_RECENT_MAX);
  try {
    localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked — recents just aren't remembered.
  }
}

function renderEmojiPicker(categoryId) {
  emojiPickerCategory = categoryId;
  const category = EMOJI_CATEGORIES.find(c => c.id === categoryId) || EMOJI_CATEGORIES[1];
  const emojis = category.id === "recent" ? loadRecentEmojis() : category.emojis;

  emojiPickerTabs.innerHTML = "";
  for (const c of EMOJI_CATEGORIES) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `emoji-picker-tab${c.id === category.id ? " active" : ""}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(c.id === category.id));
    tab.setAttribute("aria-label", c.label);
    tab.title = c.label;
    tab.innerHTML = `<i class="bi ${c.icon}"></i>`;
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      renderEmojiPicker(c.id);
    });
    emojiPickerTabs.appendChild(tab);
  }

  emojiPickerTitle.textContent = category.label;
  emojiPickerGrid.innerHTML = "";
  emojiPickerGrid.scrollTop = 0;
  if (!emojis.length) {
    const empty = document.createElement("div");
    empty.className = "emoji-picker-empty";
    empty.textContent = "Nenhum emoji recente";
    emojiPickerGrid.appendChild(empty);
    return;
  }
  for (const emoji of emojis) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.emoji = emoji;
    btn.textContent = emoji;
    emojiPickerGrid.appendChild(btn);
  }
}

/** Places a fixed popover above `anchor` (below if no room), kept inside the viewport. */
function positionPopover(el, anchor, align = "end") {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let top = rect.top - h - margin;
  if (top < margin) top = rect.bottom + margin;
  top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
  let left = align === "start" ? rect.left : rect.right - w;
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

function openEmojiPicker(anchor, mode, onPick, align = "end") {
  closeReactBar();
  emojiPickerMode = mode;
  emojiPickerOnPick = onPick;
  renderEmojiPicker(loadRecentEmojis().length ? "recent" : "smileys");
  emojiPicker.hidden = false;
  positionPopover(emojiPicker, anchor, align);
  dmEmojiBtn.setAttribute("aria-expanded", String(mode === "compose"));
}

function closeEmojiPicker() {
  if (emojiPicker.hidden) return;
  emojiPicker.hidden = true;
  emojiPickerMode = null;
  emojiPickerOnPick = null;
  dmEmojiBtn.setAttribute("aria-expanded", "false");
}

emojiPickerGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-emoji]");
  if (!btn) return;
  e.stopPropagation();
  const emoji = btn.dataset.emoji;
  rememberEmoji(emoji);
  emojiPickerOnPick?.(emoji);
});

function insertEmojiIntoInput(emoji) {
  const start = dmInput.selectionStart ?? dmInput.value.length;
  const end = dmInput.selectionEnd ?? start;
  dmInput.setRangeText(emoji, start, end, "end");
  dmInput.focus();
  dmInput.dispatchEvent(new Event("input", { bubbles: true }));
}

dmEmojiBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (emojiPickerMode === "compose") {
    closeEmojiPicker();
    dmInput.focus();
    return;
  }
  openEmojiPicker(dmEmojiBtn, "compose", insertEmojiIntoInput);
});

function myReaction(message) {
  return (message.reactions || []).find(r => r.userId === me?.userId)?.emoji || null;
}

// How reactions are sent and whose name a reaction shows. DMs use this one;
// rooms pass their own (roomReactions).
const dmReactions = {
  react: (message, emoji) => reactToMessage(message, emoji),
  nameOf: (userId) => displayName(selectedUser?.userId === userId ? selectedUser : { username: "?" }),
};

function openReactBar(message, anchor, isOwn, ctx = dmReactions) {
  closeEmojiPicker();
  closeModMenu();
  const current = myReaction(message);
  const align = isOwn ? "end" : "start";
  dmReactBar.innerHTML = "";

  for (const emoji of QUICK_REACTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.setAttribute("aria-label", `Reagir com ${emoji}`);
    btn.textContent = emoji;
    if (emoji === current) btn.classList.add("active");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeReactBar();
      ctx.react(message, emoji === current ? null : emoji);
    });
    dmReactBar.appendChild(btn);
  }

  const more = document.createElement("button");
  more.type = "button";
  more.className = "dm-react-more";
  more.setAttribute("role", "menuitem");
  more.setAttribute("aria-label", "Mais emojis");
  more.innerHTML = '<i class="bi bi-plus-lg"></i>';
  more.addEventListener("click", (e) => {
    e.stopPropagation();
    openEmojiPicker(anchor, "react", (emoji) => {
      closeEmojiPicker();
      ctx.react(message, emoji === current ? null : emoji);
    }, align);
  });
  dmReactBar.appendChild(more);

  dmReactBar.hidden = false;
  positionPopover(dmReactBar, anchor, align);
}

function closeReactBar() {
  dmReactBar.hidden = true;
}

function closeReactionPopovers() {
  closeReactBar();
  if (emojiPickerMode === "react") closeEmojiPicker();
}

function reactionsKey(message) {
  return JSON.stringify(message.reactions || []);
}

async function reactToMessage(message, emoji) {
  if (!me || !isServerId(message.id)) return;
  const previous = message.reactions || [];
  const others = previous.filter(r => r.userId !== me.userId);
  message.reactions = emoji ? [...others, { userId: me.userId, emoji }] : others;
  message.reactionPending = true;
  if (emoji) rememberEmoji(emoji);
  renderMessages({ scroll: "auto" });
  trackAppActivity("react_message");

  try {
    const r = await authFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "react", messageId: message.id, emoji }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "react failed");
    message.reactions = data.reactions || [];
  } catch (e) {
    console.warn("[app] react:", e);
    message.reactions = previous;
    showImageError("Falha ao reagir.");
  } finally {
    message.reactionPending = false;
  }
  if (messageList.includes(message)) renderMessages({ scroll: "auto" });
}

/** WhatsApp-style pill hanging off the bubble's bottom edge. */
function createReactionsPill(message, ctx = dmReactions) {
  const reactions = message.reactions || [];
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "dm-reactions";

  const counts = new Map();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
  for (const emoji of counts.keys()) {
    const span = document.createElement("span");
    span.textContent = emoji;
    pill.appendChild(span);
  }
  if (reactions.length > 1) {
    const count = document.createElement("span");
    count.className = "dm-reactions-count";
    count.textContent = String(reactions.length);
    pill.appendChild(count);
  }

  const mine = myReaction(message);
  if (mine) pill.classList.add("mine");
  const who = reactions.map(r => {
    const name = r.userId === me.userId ? "Você" : ctx.nameOf(r.userId);
    return `${name}: ${r.emoji}`;
  });
  pill.title = mine ? `${who.join("\n")}\nClique para remover sua reação` : who.join("\n");
  pill.setAttribute("aria-label", `Reações: ${who.join(", ")}`);

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mine) {
      ctx.react(message, null);
    } else {
      const bubble = pill.closest(".dm-bubble");
      openReactBar(message, pill, bubble?.classList.contains("own"), ctx);
    }
  });
  return pill;
}

function formatDayLabel(isoString) {
  const d = new Date(isoString);
  const now = new Date();

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  if (isSameDay(d, now)) return "Hoje";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Ontem";

  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  }

  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isServerId(id) {
  return typeof id === "number" && Number.isFinite(id) && id > 0;
}

function maxServerId(list) {
  let max = null;
  for (const m of list) {
    if (isServerId(m.id) && (max == null || m.id > max)) max = m.id;
  }
  return max;
}

function sortMessages() {
  messageList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function makeTempMessage(content, replyToId) {
  const replyTo = replyingTo ? { ...replyingTo } : null;
  return {
    id: `tmp-${Date.now()}-${++pendingIdSeq}`,
    temp: true,
    failed: false,
    senderId: me.userId,
    recipientId: selectedUser.userId,
    content,
    createdAt: new Date().toISOString(),
    readAt: null,
    mediaType: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: null,
    reactions: [],
    replyTo,
    replyToId: replyToId ?? null,
  };
}

function replaceTempMessage(tempId, serverMsg) {
  messageList = messageList.filter((m) => m.id !== tempId);
  const exists = messageList.some((m) => isServerId(m.id) && m.id === serverMsg.id);
  if (!exists) {
    messageList.push(serverMsg);
  }
  sortMessages();
  lastMessageId = maxServerId(messageList);
}

function getStatusIconInfo(m) {
  if (m.senderId !== me.userId) return null;
  if (m.temp) {
    if (m.failed) {
      return { cls: "bi-exclamation-circle", label: "Falha ao enviar", key: "failed" };
    }
    return { cls: "bi-clock", label: "Enviando", key: "sending" };
  }
  if (m.readAt) {
    return { cls: "bi-check-all", label: "Visualizada", key: "viewed" };
  }
  return { cls: "bi-check", label: "Enviada", key: "sent" };
}

function renderMessages(options = {}) {
  const scrollMode = options.scroll || "bottom";
  setInitialLoading(false);

  let wasNearBottom = false;
  let oldScrollTop = 0;
  if (scrollMode === "auto") {
    const distanceToBottom =
      dmMessages.scrollHeight - dmMessages.scrollTop - dmMessages.clientHeight;
    wasNearBottom = distanceToBottom <= NEAR_BOTTOM_THRESHOLD;
    oldScrollTop = dmMessages.scrollTop;
  }

  dmMessages.innerHTML = "";

  let previousDayKey = null;

  for (const m of messageList) {
    const msgDate = new Date(m.createdAt);
    const dayKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;

    if (dayKey !== previousDayKey) {
      const separator = document.createElement("div");
      separator.className = "dm-day-separator";
      separator.textContent = formatDayLabel(m.createdAt);
      dmMessages.appendChild(separator);
      previousDayKey = dayKey;
    }

    const bubble = document.createElement("div");
    const isOwn = m.senderId === me.userId;
    bubble.className = `dm-bubble ${isOwn ? "own" : "other"}${m.mediaType ? " media" : ""}`;
    bubble.dataset.id = m.id;

    if (m.replyTo) {
      const quote = document.createElement("div");
      quote.className = "dm-quote";
      quote.dataset.id = m.replyTo.id;

      const quoteName = document.createElement("div");
      quoteName.className = "dm-quote-name";
      quoteName.textContent = m.replyTo.senderUsername;

      const quoteText = document.createElement("div");
      quoteText.className = "dm-quote-text";
      appendLinkifiedText(snippet(m.replyTo), quoteText);

      quote.appendChild(quoteName);
      quote.appendChild(quoteText);
      quote.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToMessage(m.replyTo.id);
      });
      bubble.appendChild(quote);
    }

    if (m.mediaType) {
      if (m.mediaType.startsWith("audio/")) {
        bubble.appendChild(createAudioBubble(m));
      } else if (m.mediaType.startsWith("video/")) {
        bubble.appendChild(createVideoBubble(m));
      } else {
        bubble.appendChild(createImageBubble(fileUrl(m.id)));
      }
    }

    if (m.content) {
      const text = document.createElement("div");
      text.className = "dm-bubble-text";
      appendLinkifiedText(m.content, text);
      bubble.appendChild(text);
    }

    const meta = document.createElement("div");
    meta.className = "dm-meta";

    const time = document.createElement("span");
    time.className = "dm-meta-time";
    time.textContent = new Date(m.createdAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    meta.appendChild(time);

    const status = getStatusIconInfo(m);
    if (status) {
      const icon = document.createElement("i");
      icon.className = `bi ${status.cls} dm-status-icon dm-status-${status.key}`;
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", status.label);
      icon.setAttribute("title", status.label);
      meta.appendChild(icon);
    }

    bubble.appendChild(meta);

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "dm-reply-btn";
    replyBtn.setAttribute("aria-label", "Responder");
    replyBtn.innerHTML = '<i class="bi bi-reply"></i>';
    replyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setReply(m);
    });
    bubble.appendChild(replyBtn);

    if (isServerId(m.id)) {
      const reactBtn = document.createElement("button");
      reactBtn.type = "button";
      reactBtn.className = "dm-react-btn";
      reactBtn.setAttribute("aria-label", "Reagir");
      reactBtn.innerHTML = '<i class="bi bi-emoji-smile"></i>';
      reactBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openReactBar(m, reactBtn, isOwn);
      });
      bubble.appendChild(reactBtn);
    }

    if (m.reactions?.length) {
      bubble.classList.add("has-reactions");
      bubble.appendChild(createReactionsPill(m));
    }

    dmMessages.appendChild(bubble);
  }

  if (scrollMode === "bottom" || (scrollMode === "auto" && wasNearBottom)) {
    dmMessages.scrollTop = dmMessages.scrollHeight;
  } else if (scrollMode === "preserve") {
    // caller sets the exact compensated scrollTop after prepend
  } else if (scrollMode === "auto") {
    dmMessages.scrollTop = oldScrollTop;
  }
}

function showImageError(msg) {
  dmTyping.textContent = msg;
  setTimeout(() => {
    if (dmTyping.textContent === msg) dmTyping.textContent = "";
  }, 3000);
}

function formatAudioDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function cleanupAudioRecording() {
  if (audioRecorder && audioRecorder.state !== "inactive") {
    try { audioRecorder.stop(); } catch {}
  }
  if (audioRecorder?.stream) {
    audioRecorder.stream.getTracks().forEach(t => t.stop());
  }
  audioRecorder = null;
  audioChunks = [];
  clearInterval(audioRecordTimer);
  audioRecordTimer = null;
  audioRecording = false;
  recordingIntent = false;
  dmAudio.classList.remove("recording");
  dmAudio.setAttribute("aria-label", "Áudio");
}

async function startAudioRecording() {
  if (!selectedUser) return;
  if (recordingIntent) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    showImageError("Seu navegador não suporta gravação de áudio.");
    return;
  }
  recordingIntent = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!recordingIntent) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
    if (!mimeType) {
      stream.getTracks().forEach(t => t.stop());
      recordingIntent = false;
      showImageError("Formato de áudio não suportado pelo navegador.");
      return;
    }
    const options = { mimeType };
    if (mimeType.includes("opus")) {
      options.audioBitsPerSecond = 24000;
    }
    audioRecorder = new MediaRecorder(stream, options);
    audioChunks = [];
    audioRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    audioRecorder.onerror = () => {
      console.warn("[app] MediaRecorder error");
      cleanupAudioRecording();
      showImageError("Falha na gravação de áudio.");
    };
    audioRecorder.start(100);
    audioRecordStartTs = Date.now();
    audioRecording = true;
    dmAudio.classList.add("recording");
    dmAudio.setAttribute("aria-label", "Gravando áudio");
    audioRecordTimer = setInterval(() => {
      if (Date.now() - audioRecordStartTs >= MAX_AUDIO_MS) stopAudioRecording(true);
    }, 250);
  } catch (e) {
    recordingIntent = false;
    console.warn("[app] startAudioRecording:", e);
    showImageError("Não foi possível acessar o microfone.");
  }
}

function stopAudioRecording(send) {
  recordingIntent = false;
  if (!audioRecorder) return;
  const recorder = audioRecorder;
  const chunks = audioChunks;
  const mimeType = recorder.mimeType || "audio/webm";
  const durationMs = Date.now() - audioRecordStartTs;

  if (recorder.state === "inactive") {
    cleanupAudioRecording();
    return;
  }

  recorder.onstop = () => {
    recorder.stream?.getTracks().forEach(t => t.stop());
    cleanupAudioRecording();
    if (!send) return;
    if (chunks.length === 0 || durationMs < 500) {
      showImageError("Áudio muito curto.");
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = String(reader.result).split(",")[1];
      try {
        await uploadAudioBase64(base64, durationMs, mimeType);
      } catch (e) {
        console.warn("[app] audio upload:", e);
        showImageError(e.message || "Falha ao enviar áudio.");
      }
    };
    reader.readAsDataURL(blob);
  };
  recorder.stop();
}

async function uploadAudioBase64(audioBase64, durationMs, mimeType) {
  const r = await authFetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      recipientUserId: selectedUser.userId,
      audioBase64,
      durationMs,
      mediaType: mimeType,
      replyToId: replyingTo?.id,
    }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "upload failed");
  }
  clearReply();
  trackAppActivity("send_media");
  await pollConversation();
}

/** Lightbox items { id, url } of the open conversation (DM or room). */
function imageMessages() {
  if (currentRoom) {
    return roomMessages
      .filter(m => !m.deleted && m.mediaType?.startsWith("image/"))
      .map(m => ({ id: m.id, url: roomImageUrl(m.id) }));
  }
  return messageList
    .filter(m => m.mediaType?.startsWith("image/"))
    .map(m => ({ id: m.id, url: fileUrl(m.id) }));
}

function currentLightboxImages() {
  return lightboxImageSource || imageMessages();
}

function openLightbox(messageId, sourceList = null) {
  const images = sourceList || imageMessages();
  const idx = images.findIndex(img => String(img.id) === String(messageId));
  if (idx === -1) return;
  lightboxImageSource = sourceList;
  lightboxImageIndex = idx;
  setAuthedSrc(dmLightboxImg, images[idx].url);
  dmLightbox.hidden = false;
  renderLightboxNav();
  renderLightboxThumbs();
  dmLightboxClose.focus();
}

function closeLightbox() {
  dmLightbox.hidden = true;
  delete dmLightboxImg.dataset.mediaUrl;
  dmLightboxImg.removeAttribute("src");
  dmLightboxThumbs.innerHTML = "";
  lightboxImageIndex = -1;
  lightboxImageSource = null;
}

function showLightboxImage(delta) {
  const images = currentLightboxImages();
  const newIdx = lightboxImageIndex + delta;
  if (newIdx < 0 || newIdx >= images.length) return;
  lightboxImageIndex = newIdx;
  setAuthedSrc(dmLightboxImg, images[newIdx].url);
  renderLightboxNav();
  renderLightboxThumbs();
}

function renderLightboxNav() {
  const images = currentLightboxImages();
  dmLightboxPrev.hidden = lightboxImageIndex <= 0;
  dmLightboxNext.hidden = lightboxImageIndex >= images.length - 1;
}

function renderLightboxThumbs() {
  const images = currentLightboxImages();
  const start = Math.max(0, lightboxImageIndex - 3);
  const end = Math.min(images.length, lightboxImageIndex + 4);
  const windowed = images.slice(start, end);
  dmLightboxThumbs.innerHTML = "";
  for (let i = 0; i < windowed.length; i++) {
    const img = windowed[i];
    const actualIdx = start + i;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dm-lightbox-thumb" + (actualIdx === lightboxImageIndex ? " active" : "");
    const thumbImg = document.createElement("img");
    setAuthedSrc(thumbImg, img.url, { lazy: true });
    thumbImg.alt = "";
    btn.appendChild(thumbImg);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      lightboxImageIndex = actualIdx;
      setAuthedSrc(dmLightboxImg, img.url);
      renderLightboxNav();
      renderLightboxThumbs();
    });
    dmLightboxThumbs.appendChild(btn);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function measureAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener("loadedmetadata", () => {
      const ms = Math.round(audio.duration * 1000);
      cleanup();
      resolve(ms);
    });
    audio.addEventListener("error", () => {
      cleanup();
      reject(new Error("cannot measure duration"));
    });
  });
}

function openAvatarPicker() {
  profileAvatarInput.click();
}

// ── Image send pipeline: preview popup, queue, crop ─────────────────────
// Every image (DM, room, avatar) goes through here: validated, decoded and
// compressed by js/b2WrIeyFDyJ13PU.js (NagoraImage), shown in #img-preview
// with its final size, and sent only after "Enviar" / "Salvar". Pasted,
// picked or dropped images queue and are shown one at a time.
const NI = window.NagoraImage;

let imgQueue = [];      // Files waiting for the popup
let imgTotal = 0;       // size of the current batch, for "1 de 3"
let imgDone = 0;        // how many of the batch were sent or cancelled
let imgTarget = null;   // { kind: "dm", recipient } | { kind: "room", room, epoch } | { kind: "avatar" }
let imgItem = null;     // { file, decoded, crop, result, gif, url }
let imgBusy = false;    // a send is in flight
let imgSeq = 0;         // bumped whenever the popup closes; stale async work checks it
let imgCrop = null;     // crop mode: { rect, aspect, scale, drag }

function imageInputMessage(problem) {
  return problem === "size" ? STRINGS.imgTooBig : STRINGS.imgNotImage;
}

/** Where an image picked now would go: the open room, the open DM, or nowhere. */
function currentImageTarget() {
  if (currentRoom && !roomBanned) return { kind: "room", room: currentRoom, epoch: roomEpoch };
  if (selectedUser) return { kind: "dm", recipient: selectedUser };
  return null;
}

function showImageInputError(target, message) {
  if (target?.kind === "avatar") showProfileMessage(message);
  else showImageError(message);
}

/** Validates and queues files for `target`; opens the popup if it is closed. */
function queueImages(files, target) {
  if (!target || !files.length) return;
  if (imgTarget && (target.kind === "avatar" || imgTarget.kind === "avatar" || !sameImageTarget(imgTarget, target))) {
    closeImagePreview({ all: true });
  }
  let firstError = null;
  const accepted = [];
  for (const file of files) {
    const problem = NI.inputProblem(file);
    if (problem) firstError = firstError || imageInputMessage(problem);
    else accepted.push(file);
  }
  if (firstError) showImageInputError(target, firstError);
  if (!accepted.length) return;
  trackAppActivity("pick_image");
  if (!imgTarget) {
    imgTarget = target;
    imgTotal = 0;
    imgDone = 0;
  }
  imgQueue.push(...accepted);
  imgTotal += accepted.length;
  if (!imgItem) showNextImage();
}

function sameImageTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "dm") return a.recipient.userId === b.recipient.userId;
  if (a.kind === "room") return a.room === b.room && a.epoch === b.epoch;
  return true;
}

/** Decodes + compresses the next queued file, then shows it. */
async function showNextImage() {
  const file = imgQueue.shift();
  if (!file) {
    closeImagePreview({ all: true });
    return;
  }
  const seq = imgSeq;
  const target = imgTarget;
  if (target.kind !== "avatar") setUploadStatus(STRINGS.imgProcessing);
  let item;
  try {
    item = await prepareImageItem(file, target);
  } catch (e) {
    console.warn("[app] image processing:", e);
    if (seq !== imgSeq) return;
    if (target.kind !== "avatar") setUploadStatus("");
    imgDone++;
    showImageInputError(target, e.message === "too-large" ? STRINGS.imgCompressFailed
      : e.message === "gif-too-large" ? STRINGS.imgGifTooBig : STRINGS.imgDecodeFailed);
    showNextImage();
    return;
  }
  if (target.kind !== "avatar") setUploadStatus("");
  if (seq !== imgSeq) {
    releaseImageItem(item);
    return;
  }
  imgItem = item;
  openImagePreview();
}

async function prepareImageItem(file, target) {
  const avatar = target.kind === "avatar";
  if (!avatar && file.type === "image/gif" && NI.bypassesProcessing(file.type, await NI.isAnimatedGif(file) ? 2 : 1)) {
    // Animated GIF: sent as it is (the server keeps the animation), no crop.
    if (NI.outputProblem(file.size)) throw new Error("gif-too-large");
    return { file, gif: true, decoded: null, crop: null, result: { blob: file, width: null, height: null } };
  }
  const decoded = await NI.decodeImage(file);
  try {
    const crop = avatar ? NI.initialCrop(1, decoded.width, decoded.height) : null;
    const result = await NI.encodeImage(decoded, crop, avatar ? NI.AVATAR_SIDE : NI.MAX_SIDE);
    return { file, gif: false, decoded, crop, result };
  } catch (e) {
    decoded.close();
    throw e;
  }
}

function releaseImageItem(item) {
  if (!item) return;
  if (item.url) URL.revokeObjectURL(item.url);
  item.decoded?.close();
}

function openImagePreview() {
  closeReactionPopovers();
  closeEmojiPicker();
  closeModMenu();
  const avatar = imgTarget.kind === "avatar";
  imgPreview.classList.toggle("global", avatar);
  imgPreviewOverlay.classList.toggle("global", avatar);
  imgPreviewError.textContent = "";
  exitCropMode();
  renderImagePreview();
  imgPreviewOverlay.hidden = false;
  imgPreview.hidden = false;
  imgPreviewSend.focus();
}

function renderImagePreview() {
  if (!imgItem) return;
  const avatar = imgTarget.kind === "avatar";
  const { result } = imgItem;
  if (imgItem.url) URL.revokeObjectURL(imgItem.url);
  imgItem.url = URL.createObjectURL(result.blob);
  imgPreviewImg.src = imgItem.url;

  const position = imgDone + 1;
  imgPreviewTitle.textContent = avatar ? STRINGS.imgAvatarTitle
    : imgTotal > 1 ? fillString(STRINGS.imgTitleQueue, { n: Math.min(position, imgTotal), total: imgTotal })
    : STRINGS.imgTitle;
  const kb = NI.kilobytes(result.blob.size).toLocaleString("pt-BR");
  imgPreviewInfo.textContent = imgItem.gif
    ? fillString(STRINGS.imgInfoGif, { kb })
    : fillString(STRINGS.imgInfo, { kb, w: result.width, h: result.height });
  imgPreviewCrop.hidden = imgItem.gif;
  renderImageSendButton();
}

function renderImageSendButton(progress = null) {
  const avatar = imgTarget?.kind === "avatar";
  imgPreviewSend.disabled = imgBusy;
  imgPreviewCancel.disabled = imgBusy;
  imgPreviewCrop.disabled = imgBusy;
  imgPreviewSend.textContent = imgBusy
    ? fillString(STRINGS.imgSending, { p: Math.round((progress || 0) * 100) })
    : (avatar ? STRINGS.imgSave : STRINGS.imgSend);
}

/** Closes the popup. `all` also drops the rest of the queue. */
function closeImagePreview({ all = false } = {}) {
  imgSeq++;
  exitCropMode();
  releaseImageItem(imgItem);
  imgItem = null;
  imgBusy = false;
  imgPreview.hidden = true;
  imgPreviewOverlay.hidden = true;
  imgPreviewImg.removeAttribute("src");
  if (all) {
    imgQueue = [];
    imgTarget = null;
    imgTotal = 0;
    imgDone = 0;
    setUploadStatus("");
  }
}

/** Current image done (sent or cancelled): show the next one or close. */
function finishCurrentImage() {
  const target = imgTarget;
  imgDone++;
  closeImagePreview();
  imgTarget = target;
  if (imgQueue.length) showNextImage();
  else closeImagePreview({ all: true });
  if (target?.kind !== "avatar" && imgPreview.hidden) dmInput.focus({ preventScroll: true });
}

function cancelImage() {
  if (imgBusy || !imgItem) return;
  finishCurrentImage();
}

/** POST with upload progress (fetch has none). Same token / 401 handling as authFetch. */
async function authUpload(url, payload, onProgress) {
  const attempt = async () => {
    const token = await ensureClientToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-NAGORA-Token", token);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, data });
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(JSON.stringify(payload));
    });
  };
  let res = await attempt();
  if (res.status === 401) {
    clearClientToken();
    res = await attempt();
    if (res.status === 401) location.href = "index.html";
  }
  return res;
}

/** pt-BR text for a failed image send (server texts only for 429). */
function imageSendErrorText(res) {
  if (res.status === 429 && res.data?.error) return res.data.error;
  if (res.status === 400 && res.data?.error === "Image file is too large") return STRINGS.imgServerTooBig;
  if (res.status === 400 && /image/i.test(res.data?.error || "")) return STRINGS.imgUnsupported;
  return STRINGS.imgSendFailed;
}

async function sendCurrentImage() {
  if (imgBusy || !imgItem || imgCrop) return;
  const seq = imgSeq;
  const target = imgTarget;
  imgBusy = true;
  imgPreviewError.textContent = "";
  renderImageSendButton(0);
  const onProgress = (p) => { if (seq === imgSeq) renderImageSendButton(p); };

  let res;
  try {
    const imageBase64 = await fileToBase64(imgItem.result.blob);
    if (target.kind === "avatar") {
      res = await authUpload("/api/avatar", { imageBase64 }, onProgress);
    } else if (target.kind === "dm") {
      res = await authUpload("/api/file", {
        recipientUserId: target.recipient.userId,
        imageBase64,
        replyToId: replyingTo?.id,
      }, onProgress);
    } else {
      res = await authUpload("/api/rooms", {
        action: "image",
        room: target.room,
        imageBase64,
        replyToId: replyingTo?.id,
      }, onProgress);
    }
  } catch (e) {
    console.warn("[app] image send:", e);
    res = { status: 0, ok: false, data: {} };
  }
  if (seq !== imgSeq) {
    // The popup was closed meanwhile (conversation switched): still refresh the DM.
    if (res.ok && target.kind === "dm" && selectedUser?.userId === target.recipient.userId) pollConversation();
    return;
  }
  imgBusy = false;

  if (target.kind === "room" && res.status === 403 && res.data?.error === "banned") {
    myBans = { all: !!res.data.all, rooms: Array.isArray(res.data.rooms) ? res.data.rooms : [] };
    renderRooms();
    closeImagePreview({ all: true });
    if (currentRoom && bannedFromRoom(currentRoom) && !roomBanned) showBanPopup();
    return;
  }
  if (!res.ok) {
    // The popup stays open with the error so the user can try again.
    imgPreviewError.textContent = imageSendErrorText(res);
    renderImageSendButton();
    imgPreviewSend.focus();
    return;
  }

  if (target.kind === "avatar") {
    avatarEpoch++;
    me.hasAvatar = true;
    renderProfileSummary();
    renderUsers(usersCache);
    showProfileMessage("Foto atualizada", false);
    trackAppActivity("avatar_upload");
  } else {
    if (replyingTo) clearReply();
    trackAppActivity("send_media");
    if (target.kind === "dm") {
      if (selectedUser?.userId === target.recipient.userId) pollConversation();
    } else if (target.epoch === roomEpoch && res.data?.message?.id) {
      if (!roomMessages.some(m => m.id === res.data.message.id)) {
        roomMessages.push(res.data.message);
        sortRoomMessages();
      }
      if (roomOldestId == null) roomOldestId = roomMessages[0].id;
      renderRoomMessages({ scroll: "bottom" });
    }
  }
  finishCurrentImage();
}

// ── Crop mode ──
function renderCropPresets() {
  imgCropPresets.innerHTML = "";
  for (const preset of NI.CROP_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = preset.aspect ? preset.id : STRINGS.imgCropFree;
    btn.setAttribute("aria-pressed", String(imgCrop?.presetId === preset.id));
    btn.addEventListener("click", () => {
      if (!imgCrop) return;
      imgCrop.presetId = preset.id;
      imgCrop.aspect = preset.aspect;
      imgCrop.rect = NI.initialCrop(preset.aspect, imgItem.decoded.width, imgItem.decoded.height);
      renderCropPresets();
      renderCropBox();
    });
    imgCropPresets.appendChild(btn);
  }
}

function enterCropMode() {
  if (!imgItem || imgItem.gif || imgBusy) return;
  const { decoded } = imgItem;
  const avatar = imgTarget.kind === "avatar";
  imgCrop = {
    presetId: avatar ? "1:1" : "free",
    aspect: avatar ? 1 : null,
    rect: { ...(imgItem.crop || NI.initialCrop(null, decoded.width, decoded.height)) },
    scale: 1,
    drag: null,
  };
  imgPreviewImg.hidden = true;
  imgCropWrap.hidden = false;
  imgPreviewActions.hidden = true;
  imgCropActions.hidden = false;
  imgCropPresets.hidden = avatar; // avatars are locked to 1:1
  imgPreviewError.textContent = "";
  renderCropPresets();
  drawCropCanvas();
  imgCropApply.focus();
}

function exitCropMode() {
  imgCrop = null;
  imgCropWrap.hidden = true;
  imgCropPresets.hidden = true;
  imgCropActions.hidden = true;
  imgPreviewActions.hidden = false;
  imgPreviewImg.hidden = false;
}

/** The original (uncompressed) image, scaled to fit the stage. */
function drawCropCanvas() {
  if (!imgCrop || !imgItem) return;
  const { decoded } = imgItem;
  const maxW = Math.max(100, (imgPreviewStage.clientWidth || 320) - 20); // minus the stage padding
  const maxH = Math.min(window.innerHeight * 0.5, 360);
  const scale = Math.min(maxW / decoded.width, maxH / decoded.height, 1);
  const cssW = Math.max(1, Math.round(decoded.width * scale));
  const cssH = Math.max(1, Math.round(decoded.height * scale));
  const dpr = window.devicePixelRatio || 1;
  imgCropCanvas.width = Math.round(cssW * dpr);
  imgCropCanvas.height = Math.round(cssH * dpr);
  imgCropCanvas.style.width = `${cssW}px`;
  imgCropCanvas.style.height = `${cssH}px`;
  imgCropWrap.style.width = `${cssW}px`;
  imgCropWrap.style.height = `${cssH}px`;
  // Scaled copy drawn once; every drag frame only copies it and dims the outside.
  const base = document.createElement("canvas");
  base.width = imgCropCanvas.width;
  base.height = imgCropCanvas.height;
  base.getContext("2d").drawImage(decoded.source, 0, 0, base.width, base.height);
  imgCrop.base = base;
  imgCrop.scale = cssW / decoded.width;
  imgCrop.dpr = imgCropCanvas.width / cssW;
  renderCropBox();
}

function renderCropBox() {
  if (!imgCrop) return;
  const { rect, scale } = imgCrop;
  imgCropBox.style.left = `${rect.x * scale}px`;
  imgCropBox.style.top = `${rect.y * scale}px`;
  imgCropBox.style.width = `${rect.w * scale}px`;
  imgCropBox.style.height = `${rect.h * scale}px`;
  if (!imgCrop.base) return;
  const ctx = imgCropCanvas.getContext("2d");
  const k = scale * imgCrop.dpr;
  ctx.drawImage(imgCrop.base, 0, 0);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  ctx.rect(0, 0, imgCropCanvas.width, imgCropCanvas.height);
  ctx.rect(rect.x * k, rect.y * k, rect.w * k, rect.h * k);
  ctx.fill("evenodd");
}

imgCropBox.addEventListener("pointerdown", (e) => {
  if (!imgCrop || e.button > 0) return;
  e.preventDefault();
  try {
    imgCropBox.setPointerCapture(e.pointerId); // keeps the drag when the finger leaves the box
  } catch { /* pointer already gone */ }
  imgCrop.drag = {
    pointerId: e.pointerId,
    corner: e.target.dataset.corner || null,
    startX: e.clientX,
    startY: e.clientY,
    startRect: { ...imgCrop.rect },
  };
});

imgCropBox.addEventListener("pointermove", (e) => {
  const drag = imgCrop?.drag;
  if (!drag || drag.pointerId !== e.pointerId) return;
  const { width: W, height: H } = imgItem.decoded;
  const dx = (e.clientX - drag.startX) / imgCrop.scale;
  const dy = (e.clientY - drag.startY) / imgCrop.scale;
  // The minimum side is about 24 screen pixels, so handles never overlap.
  const min = Math.max(NI.MIN_CROP, 24 / imgCrop.scale);
  imgCrop.rect = drag.corner
    ? NI.resizeCrop(drag.startRect, drag.corner, dx, dy, imgCrop.aspect, W, H, min)
    : NI.moveCrop(drag.startRect, dx, dy, W, H);
  renderCropBox();
});

function endCropDrag(e) {
  if (imgCrop?.drag?.pointerId === e.pointerId) imgCrop.drag = null;
}
imgCropBox.addEventListener("pointerup", endCropDrag);
imgCropBox.addEventListener("pointercancel", endCropDrag);

function resetCrop() {
  if (!imgCrop) return;
  const avatar = imgTarget.kind === "avatar";
  imgCrop.presetId = avatar ? "1:1" : "free";
  imgCrop.aspect = avatar ? 1 : null;
  imgCrop.rect = NI.initialCrop(imgCrop.aspect, imgItem.decoded.width, imgItem.decoded.height);
  renderCropPresets();
  renderCropBox();
}

/** Re-encodes from the original decoded image (never from the compressed one). */
async function applyCrop() {
  if (!imgCrop || !imgItem || imgBusy) return;
  const seq = imgSeq;
  const item = imgItem;
  const rect = NI.roundCrop(imgCrop.rect, item.decoded.width, item.decoded.height);
  imgCropApply.disabled = true;
  try {
    const result = await NI.encodeImage(item.decoded, rect, imgTarget.kind === "avatar" ? NI.AVATAR_SIDE : NI.MAX_SIDE);
    if (seq !== imgSeq || item !== imgItem) return;
    item.crop = rect;
    item.result = result;
    exitCropMode();
    renderImagePreview();
    imgPreviewSend.focus();
  } catch (e) {
    console.warn("[app] crop encode:", e);
    if (seq === imgSeq) imgPreviewError.textContent = e.message === "too-large" ? STRINGS.imgCompressFailed : STRINGS.imgDecodeFailed;
  } finally {
    imgCropApply.disabled = false;
  }
}

function cancelCrop() {
  exitCropMode();
  imgPreviewCrop.focus();
}

imgPreviewSend.addEventListener("click", sendCurrentImage);
imgPreviewCancel.addEventListener("click", cancelImage);
imgPreviewOverlay.addEventListener("click", () => { if (!imgBusy) cancelImage(); });
imgPreviewCrop.addEventListener("click", enterCropMode);
imgCropApply.addEventListener("click", applyCrop);
imgCropReset.addEventListener("click", resetCrop);
imgCropCancel.addEventListener("click", cancelCrop);
window.addEventListener("resize", () => { if (imgCrop) drawCropCanvas(); });

// Drag and drop onto the open conversation (DM or room).
function dragHasFiles(e) {
  return [...(e.dataTransfer?.types || [])].includes("Files");
}
dmPanel.addEventListener("dragover", (e) => {
  if (!dragHasFiles(e) || !currentImageTarget()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  dmPanel.classList.add("drag-over");
});
dmPanel.addEventListener("dragleave", (e) => {
  if (!dmPanel.contains(e.relatedTarget)) dmPanel.classList.remove("drag-over");
});
dmPanel.addEventListener("drop", (e) => {
  dmPanel.classList.remove("drag-over");
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  queueImages([...e.dataTransfer.files], currentImageTarget());
});

async function pollConversation() {
  if (!selectedUser || document.visibilityState !== "visible") return;

  // Gate: slow-poll when the DM recipient is offline.
  if (selectedUser.online === false) {
    const now = Date.now();
    if (now - lastOfflineCheckAt < OFFLINE_POLL_MS) return;
    lastOfflineCheckAt = now;
  }

  const epoch = conversationEpoch;

  try {
    const r = await authFetch(
      `/api/messages?with=${encodeURIComponent(selectedUser.userId)}&limit=${MESSAGE_PAGE_LIMIT}`,
      { credentials: "include" }
    );
    if (!r.ok) throw new Error("messages fetch failed");
    const data = await r.json();

    if (epoch !== conversationEpoch) return;

    if (typeof data.recipientOnline === "boolean" && selectedUser) {
      const status = data.recipientStatus || (data.recipientOnline ? "online" : "offline");
      selectedUser.online = data.recipientOnline;
      selectedUser.status = status;
      const cached = usersCache.find(u => u.userId === selectedUser.userId);
      if (cached) {
        cached.online = data.recipientOnline;
        cached.status = status;
      }
      dmStatus.className = `status-dot ${status}`;
    }

    const fetched = data.messages || [];

    if (messageList.length === 0) {
      messageList = fetched.slice();
      if (messageList.length > 0) {
        oldestLoadedId = messageList[0].id;
        lastMessageId = maxServerId(messageList);
      }
      noMoreOlder = fetched.length < MESSAGE_PAGE_LIMIT;
      renderMessages({ scroll: "bottom" });
    } else {
      const indexById = new Map();
      for (let i = 0; i < messageList.length; i++) {
        if (isServerId(messageList[i].id)) {
          indexById.set(messageList[i].id, i);
        }
      }

      let readAtChanged = false;
      let reactionsChanged = false;
      const newMessages = [];

      for (const m of fetched) {
        const idx = indexById.get(m.id);
        if (idx !== undefined) {
          const local = messageList[idx];
          if (local.readAt !== m.readAt) {
            local.readAt = m.readAt;
            readAtChanged = true;
          }
          if (!local.reactionPending && reactionsKey(local) !== reactionsKey(m)) {
            local.reactions = m.reactions || [];
            reactionsChanged = true;
          }
        } else if (isServerId(m.id) && (lastMessageId == null || m.id > lastMessageId)) {
          newMessages.push(m);
        }
      }

      if (newMessages.length > 0) {
        messageList = messageList.concat(newMessages);
        sortMessages();
        lastMessageId = maxServerId(messageList);

        if (newMessages.some(m => m.senderId === selectedUser.userId)) {
          if (amAway()) {
            // Away: leave them unread (no "Visualizada") — fetchUnread plays the
            // sound and counts them; they're marked read on "nagora:active".
            fetchUnread({ force: true });
          } else {
            markRead(selectedUser.userId);
            social.unread.delete(selectedUser.userId);
            renderUsers(usersCache);
            updateTitle();
          }
        }
      }

      if (oldestLoadedId == null) {
        const oldest = messageList.find(isServerId);
        if (oldest) {
          oldestLoadedId = oldest.id;
          noMoreOlder = fetched.length < MESSAGE_PAGE_LIMIT;
        }
      }

      if (readAtChanged || reactionsChanged || newMessages.length > 0) {
        renderMessages({ scroll: "auto" });
      }
    }

    dmTyping.textContent = data.typing ? "digitando…" : "";
  } catch (e) {
    console.warn("[app] pollConversation:", e);
    if (epoch === conversationEpoch) setInitialLoading(false);
  }
}

async function loadOlder() {
  if (!selectedUser || noMoreOlder || loadingOlder) return;
  if (messageList.length === 0 || oldestLoadedId == null) return;

  const epoch = conversationEpoch;
  loadingOlder = true;
  showOlderLoader(true);

  try {
    const r = await authFetch(
      `/api/messages?with=${encodeURIComponent(selectedUser.userId)}&before=${encodeURIComponent(oldestLoadedId)}&limit=${MESSAGE_PAGE_LIMIT}`,
      { credentials: "include" }
    );
    if (!r.ok) throw new Error("older messages fetch failed");
    const data = await r.json();

    if (epoch !== conversationEpoch) return;

    const older = data.messages || [];

    if (older.length === 0) {
      noMoreOlder = true;
      return;
    }

    showOlderLoader(false);

    const oldScrollHeight = dmMessages.scrollHeight;
    const oldScrollTop = dmMessages.scrollTop;

    messageList = older.concat(messageList);
    oldestLoadedId = messageList[0].id;
    noMoreOlder = older.length < MESSAGE_PAGE_LIMIT;

    renderMessages({ scroll: "preserve" });
    dmMessages.scrollTop = oldScrollTop + (dmMessages.scrollHeight - oldScrollHeight);
  } catch (e) {
    console.warn("[app] loadOlder:", e);
  } finally {
    if (epoch === conversationEpoch) {
      loadingOlder = false;
      showOlderLoader(false);
    }
  }
}

function showOlderLoader(show) {
  dmMessages.classList.toggle("loading-older", show);
}

function startPoll() {
  pollConversation();
  if (pollInterval) return;
  pollInterval = setInterval(pollConversation, 500);
}

function stopPoll() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function recipientOnline() {
  if (!selectedUser) return false;
  const live = usersCache.find(u => u.userId === selectedUser.userId);
  return live ? live.online : selectedUser.online;
}

async function postTyping(typing) {
  if (!selectedUser) return;
  if (!recipientOnline()) return;
  try {
    await authFetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        recipientUserId: selectedUser.userId,
        typing,
      }),
    });
  } catch (e) {
    console.warn("[app] postTyping:", e);
  }
}

function autoResizeInput() {
  if (!dmInput) return;
  dmInput.style.height = "auto";
  dmInput.style.height = dmInput.scrollHeight + "px";
}

async function sendMessage() {
  if (currentRoom) return sendRoomMessage();
  if (!selectedUser) return;
  const content = String(dmInput.value).trim();
  if (!content) return;
  trackAppActivity("send_message");

  const epoch = conversationEpoch;
  const originalContent = content;
  const originalReply = replyingTo ? { ...replyingTo } : null;

  const tempMsg = makeTempMessage(content, replyingTo?.id);
  messageList.push(tempMsg);
  renderMessages({ scroll: "bottom" });

  dmInput.value = "";
  autoResizeInput();
  clearTimeout(typingDebounceTimer);

  try {
    await postTyping(false);

    const r = await authFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "send",
        recipientUserId: selectedUser.userId,
        content,
        replyToId: replyingTo?.id,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || "send failed");
    }

    const data = await r.json();
    const serverMsg = data?.message;
    if (!serverMsg?.id) throw new Error("send returned no message");

    if (epoch !== conversationEpoch) return;

    replaceTempMessage(tempMsg.id, serverMsg);
    renderMessages({ scroll: "bottom" });
    clearReply();
  } catch (e) {
    console.warn("[app] sendMessage:", e);

    if (epoch !== conversationEpoch) return;

    const idx = messageList.findIndex((m) => m.id === tempMsg.id);
    if (idx !== -1) {
      messageList[idx].failed = true;
    }

    dmInput.value = originalContent;
    autoResizeInput();
    if (originalReply) {
      replyingTo = originalReply;
      renderReplyBar();
    }

    renderMessages({ scroll: "auto" });
  }
}

dmInput.addEventListener("keydown", (e) => {
  if (!imgPreview.hidden) return; // the popup owns Enter
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

dmSend.addEventListener("click", sendMessage);

replyCancel.addEventListener("click", clearReply);

dmInput.addEventListener("input", async () => {
  autoResizeInput();
  if (!selectedUser) return;
  const value = String(dmInput.value).trim();

  if (!value) {
    clearTimeout(typingDebounceTimer);
    await postTyping(false);
    return;
  }

  if (Date.now() - lastTypingPost > 2000) {
    lastTypingPost = Date.now();
    await postTyping(true);
  }

  clearTimeout(typingDebounceTimer);
  typingDebounceTimer = setTimeout(async () => {
    await postTyping(false);
  }, 2500);
});

dmAttach.addEventListener("click", () => {
  dmAttachMenu.classList.toggle("open");
});

dmImageBtn.addEventListener("click", () => {
  dmImageInput.click();
  dmAttachMenu.classList.remove("open");
});

dmImageInput.addEventListener("change", () => {
  const files = [...(dmImageInput.files || [])];
  dmImageInput.value = "";
  queueImages(files, currentImageTarget());
});

// Ctrl+V of one or more images opens the preview popup (queued, one at a
// time). Clipboards that also carry text (e.g. spreadsheet cells) paste as text.
dmInput.addEventListener("paste", (e) => {
  const data = e.clipboardData;
  const target = currentImageTarget();
  if (!data || !target) return;
  if (data.getData("text/plain").trim()) return;
  const files = [...data.items].filter(i => i.kind === "file").map(i => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  queueImages(files, target);
});

dmVideoBtn.addEventListener("click", () => {
  dmVideoInput.click();
  dmAttachMenu.classList.remove("open");
});

dmVideoInput.addEventListener("change", () => {
  const file = dmVideoInput.files?.[0];
  dmVideoInput.value = "";
  sendVideoFile(file);
});

dmAudioFileBtn.addEventListener("click", () => {
  dmAudioInput.click();
  dmAttachMenu.classList.remove("open");
});

dmAudioInput.addEventListener("change", async () => {
  const file = dmAudioInput.files?.[0];
  dmAudioInput.value = "";
  if (!file || !selectedUser) return;

  if (!file.type.startsWith("audio/")) {
    showImageError("Apenas arquivos de áudio são permitidos.");
    return;
  }

  let durationMs = null;
  try { durationMs = await measureAudioDuration(file); } catch { durationMs = null; }

  try {
    const base64 = await fileToBase64(file);
    await uploadAudioBase64(base64, durationMs, file.type);
  } catch (e) {
    console.warn("[app] audio file upload:", e);
    showImageError(e.message || "Falha ao enviar áudio.");
  }
});

dmAudio.addEventListener("click", () => {
  if (!selectedUser) return;
  if (recordingIntent || audioRecording) {
    stopAudioRecording(true);
  } else {
    startAudioRecording();
  }
});
dmAudio.addEventListener("contextmenu", (e) => e.preventDefault());

// Open lightbox when any image inside a bubble is clicked.
dmMessages.addEventListener("click", (e) => {
  const img = e.target.closest(".dm-bubble img");
  if (!img || img.closest(".dm-video-wrap")) return;
  const bubble = img.closest(".dm-bubble");
  const messageId = bubble?.dataset.id;
  if (!messageId) return;
  openLightbox(messageId);
});

// Close lightbox on backdrop click or close button.
dmLightbox.addEventListener("click", (e) => {
  if (e.target === dmLightbox || e.target.closest(".dm-lightbox-close")) {
    closeLightbox();
  }
});

dmLightboxPrev.addEventListener("click", (e) => { e.stopPropagation(); showLightboxImage(-1); });
dmLightboxNext.addEventListener("click", (e) => { e.stopPropagation(); showLightboxImage(1); });

// Search behavior
searchToggle.addEventListener("click", () => {
  const hidden = searchBox.hidden;
  searchBox.hidden = !hidden;
  if (!searchBox.hidden) searchInput.focus();
});

searchInput.addEventListener("input", () => {
  searchTerm = String(searchInput.value).trim().replace(/^@/, "");
  renderUsers(usersCache);
});

// Profile accordion
function enterShownameEdit() {
  shownameInput.value = me.showname || "";
  shownameDisplay.hidden = true;
  shownameEditRow.hidden = false;
  shownameInput.focus();
}

function exitShownameEdit() {
  shownameEditRow.hidden = true;
  shownameDisplay.hidden = false;
}

function renderProfileSummary() {
  if (!me) return;
  profileName.textContent = `@${me.username}`;
  applyNameColor(profileName, me.nameColor);
  shownameInput.value = me.showname || "";
  setAvatarOrFallback(profileIcon, me.userId, me.hasAvatar, "avatar-img");
  setAvatarOrFallback(profileAvatar, me.userId, me.hasAvatar, "avatar-img avatar-img-large");

  profilePfpBtn.textContent = me.hasAvatar ? "Editar PFP" : "Adicionar PFP";

  if (me.showname) {
    shownameValue.textContent = me.showname;
    shownameValue.classList.remove("empty");
    shownameEdit.textContent = "Editar";
  } else {
    shownameValue.textContent = "—";
    shownameValue.classList.add("empty");
    shownameEdit.textContent = "Adicionar";
  }

  exitShownameEdit();
  renderAccountProfile();
}

function toggleProfile() {
  profileExpanded = !profileExpanded;
  profileCard.classList.toggle("expanded", profileExpanded);
  profileBody.hidden = !profileExpanded;
  profileSummary.setAttribute("aria-expanded", String(profileExpanded));
  const chevron = profileSummary.querySelector(".profile-chevron i");
  if (chevron) {
    chevron.classList.toggle("bi-chevron-up", !profileExpanded);
    chevron.classList.toggle("bi-chevron-down", profileExpanded);
  }
}

function renderProfileBadge() {
  profileBadge.hidden = social.incoming.size === 0;
}

function renderIncomingRequests() {
  profileRequestsList.innerHTML = "";
  if (social.incoming.size === 0) {
    profileRequests.hidden = true;
    return;
  }
  profileRequests.hidden = false;

  for (const req of social.incoming.values()) {
    const row = document.createElement("div");
    row.className = "profile-request-row";

    const name = document.createElement("span");
    name.className = "profile-request-name";
    name.textContent = displayName({
      showname: req.senderShowname,
      username: req.senderUsername,
    });

    const actions = document.createElement("div");
    actions.className = "profile-request-actions";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.textContent = "Aceitar";
    acceptBtn.addEventListener("click", () => answerRequest(req.senderId, "accept"));

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.textContent = "Recusar";
    declineBtn.addEventListener("click", () => answerRequest(req.senderId, "decline"));

    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
    row.appendChild(name);
    row.appendChild(actions);
    profileRequestsList.appendChild(row);
  }
}

function showProfileMessage(text, isError = true) {
  profileMessage.textContent = text;
  profileMessage.className = isError ? "profile-message error" : "profile-message success";
  // The avatar and display-name flows are shared with the account dashboard.
  if (!accountView.hidden) setAccountMessage(accountProfileMessage, text, isError, 3000);
  setTimeout(() => {
    if (profileMessage.textContent === text) {
      profileMessage.textContent = "";
      profileMessage.className = "profile-message";
    }
  }, 3000);
}

profileSummary.addEventListener("click", toggleProfile);

profileIcon.addEventListener("click", (e) => {
  e.stopPropagation();
  openAvatarPicker();
});

profileAvatar.addEventListener("click", openAvatarPicker);
profilePfpBtn.addEventListener("click", openAvatarPicker);
shownameEdit.addEventListener("click", enterShownameEdit);
shownameCancel.addEventListener("click", exitShownameEdit);

// Avatar: same preview popup, crop locked to 1:1, then POST /api/avatar.
profileAvatarInput.addEventListener("change", () => {
  const file = profileAvatarInput.files?.[0];
  profileAvatarInput.value = "";
  if (file) queueImages([file], { kind: "avatar" });
});

/** Saves the display name (sidebar profile and account dashboard). Resolves true on success. */
async function saveShowname(rawValue) {
  const value = String(rawValue).trim();
  try {
    const r = await authFetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "setShowname", showname: value }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showProfileMessage(data.error || "Erro ao salvar");
      return false;
    }
    me.showname = data.showname || null;
    renderProfileSummary();
    showProfileMessage("Salvo", false);
    trackAppActivity("update_profile");
    exitShownameEdit();
    return true;
  } catch (e) {
    console.warn("[app] save showname:", e);
    showProfileMessage("Erro ao salvar");
    return false;
  }
}

shownameSave.addEventListener("click", () => saveShowname(shownameInput.value));

function openLogoutConfirm() {
  logoutConfirmOverlay.hidden = false;
  logoutConfirm.hidden = false;
  logoutConfirmCancel.focus();
}

function closeLogoutConfirm() {
  logoutConfirmOverlay.hidden = true;
  logoutConfirm.hidden = true;
}

profileLogout.addEventListener("click", () => {
  openLogoutConfirm();
});

logoutConfirmCancel.addEventListener("click", closeLogoutConfirm);
logoutConfirmOverlay.addEventListener("click", closeLogoutConfirm);

logoutConfirmOk.addEventListener("click", async () => {
  closeLogoutConfirm();
  try {
    await authFetch("/api/logout", { method: "POST", credentials: "include" });
  } catch (e) {
    console.warn("[app] logout:", e);
  }
  location.href = "index.html";
});

// User bubble: profile popup for a user-list row (non-friends) or a room avatar / name.
// Shows the large avatar, the name in its color, the account creation date and
// the friendship state. Friendship is re-checked against the server on open.
let bubbleSeq = 0;
let bubbleDetails = null; // null = loading, { failed: true }, or the loaded profile

function openBubble(user) {
  bubbleUser = user;
  bubbleDetails = null;
  userBubbleAvatar.dataset.key = "";
  userBubble.hidden = false;
  renderBubble();
  loadBubbleDetails(user);
}

function closeBubble() {
  bubbleSeq++;
  bubbleUser = null;
  bubbleDetails = null;
  userBubble.hidden = true;
}

async function loadBubbleDetails(user) {
  const seq = ++bubbleSeq;
  const own = user.userId === me?.userId;
  try {
    const url = own ? "/api/me" : `/api/contact?targetUserId=${encodeURIComponent(user.userId)}`;
    const r = await authFetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`profile ${r.status}`);
    const data = await r.json();
    if (seq !== bubbleSeq) return;
    const details = {
      createdAt: own ? data.createdAt : data.accountCreatedAt,
      friends: !own && !!data.friendsSince,
      hasAvatar: !!data.hasAvatar,
      showname: data.showname || null,
      nameColor: data.nameColor || null,
    };
    // The server decides friendship; a stale local list is refreshed so the
    // sidebar agrees with what the popup shows.
    if (!own && details.friends !== social.friendIds.has(user.userId)) {
      await fetchSocial();
      if (seq !== bubbleSeq) return;
    }
    bubbleDetails = details;
  } catch (e) {
    console.warn("[app] user profile:", e);
    if (seq !== bubbleSeq) return;
    bubbleDetails = { failed: true };
  }
  renderBubble();
}

function bubbleButton(label, onClick, primary = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  if (primary) btn.classList.add("primary");
  if (onClick) btn.addEventListener("click", onClick);
  userBubbleActions.appendChild(btn);
  return btn;
}

function setBubbleLine(icon, text) {
  userBubbleFriend.hidden = !text;
  if (!text) return;
  userBubbleFriend.querySelector("i").className = `bi ${icon}`;
  userBubbleFriendText.textContent = text;
}

function renderBubble() {
  if (!bubbleUser) return;
  const u = bubbleUser;
  const d = bubbleDetails && !bubbleDetails.failed ? bubbleDetails : null;
  const own = u.userId === me?.userId;

  const hasAvatar = d ? d.hasAvatar : (own ? !!me.hasAvatar : !!u.hasAvatar);
  const avatarKey = `${u.userId}:${hasAvatar}:${avatarEpoch}`;
  if (userBubbleAvatar.dataset.key !== avatarKey) {
    userBubbleAvatar.dataset.key = avatarKey;
    setAvatarOrFallback(userBubbleAvatar, u.userId, hasAvatar, "user-bubble-avatar-img");
  }

  userBubbleName.textContent = displayName(d ? { ...u, showname: d.showname } : (own ? me : u));
  applyNameColor(userBubbleName, own ? me.nameColor : (d ? d.nameColor : nameColorOf(u.userId, u.nameColor)));
  userBubbleHandle.textContent = `@${u.username}`;
  userBubbleCreated.hidden = !!bubbleDetails?.failed;
  userBubbleCreated.textContent = d
    ? fillString(STRINGS.bubbleCreated, { date: formatAccountDate(d.createdAt) })
    : STRINGS.bubbleLoading;
  userBubbleActions.innerHTML = "";

  if (own) {
    setBubbleLine("bi-person-fill", STRINGS.bubbleYou);
    bubbleButton(STRINGS.bubbleOpenAccount, () => openAccount(), true);
    return;
  }

  const isFriend = social.friendIds.has(u.userId) || !!d?.friends;
  const incoming = social.incoming.has(u.userId);
  const outgoing = social.outgoing.has(u.userId);

  if (!isFriend && !bubbleDetails) {
    // Still asking the server: a stale local list must not offer "Enviar solicitação".
    setBubbleLine("", "");
    return;
  }

  if (!isFriend && !social.friendsLoaded && !d) {
    // Neither the friend list nor the profile loaded: we cannot tell friend from
    // stranger, so do not offer "Enviar solicitação".
    setBubbleLine("", "");
    const note = document.createElement("div");
    note.className = "user-bubble-error";
    note.textContent = STRINGS.bubbleFriendsFailed;
    userBubbleActions.appendChild(note);
    const retry = bubbleButton(STRINGS.bubbleRetry, async () => {
      retry.disabled = true;
      retry.textContent = STRINGS.bubbleLoading;
      await fetchSocial();
      if (bubbleUser === u) loadBubbleDetails(u);
    });
    return;
  }

  if (isFriend) {
    setBubbleLine("bi-people-fill", STRINGS.bubbleFriends);
    bubbleButton(STRINGS.bubbleGoToDms, () => selectUser(u), true);
  } else if (incoming) {
    setBubbleLine("bi-person-plus-fill", STRINGS.bubbleIncoming);
    bubbleButton(STRINGS.bubbleAccept, async () => {
      const ok = await answerRequest(u.userId, "accept");
      if (ok) selectUser(u);
    }, true);
    bubbleButton(STRINGS.bubbleDecline, async () => {
      await answerRequest(u.userId, "decline");
      closeBubble();
    });
  } else if (outgoing) {
    setBubbleLine("", "");
    bubbleButton(STRINGS.bubbleRequestSent).disabled = true;
  } else {
    setBubbleLine("", "");
    const btn = bubbleButton(STRINGS.bubbleSendRequest, async () => {
      btn.disabled = true;
      try {
        const r = await authFetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "send", targetUserId: u.userId }),
        });
        if (!r.ok) throw new Error(`send request failed (${r.status})`);
        await fetchSocial();
        await fetchIncomingBadge();
        trackAppActivity("friend_request_send");
        if (bubbleUser === u) renderBubble();
      } catch (e) {
        console.warn("[app] send request:", e);
        // e.g. 409 "already friends" when the local friend list was stale.
        await fetchSocial();
        if (bubbleUser !== u) return;
        renderBubble();
        if (!social.friendIds.has(u.userId) && !social.outgoing.has(u.userId)) {
          const note = document.createElement("div");
          note.className = "user-bubble-error";
          note.textContent = STRINGS.bubbleSendFailed;
          userBubbleActions.prepend(note);
        }
      }
    }, true);
  }
}

userBubbleClose.addEventListener("click", closeBubble);

// Contact panel
function switchContactTab(tab) {
  activeContactTab = tab;
  contactTabInfo.classList.toggle("active", tab === "info");
  contactTabMedia.classList.toggle("active", tab === "media");
  contactTabInfo.setAttribute("aria-selected", String(tab === "info"));
  contactTabMedia.setAttribute("aria-selected", String(tab === "media"));
  contactTabInfoPanel.classList.toggle("active", tab === "info");
  contactTabInfoPanel.hidden = tab !== "info";
  contactTabMediaPanel.classList.toggle("active", tab === "media");
  contactTabMediaPanel.hidden = tab !== "media";
  if (tab === "media") fetchMedia();
}

contactTabInfo.addEventListener("click", () => switchContactTab("info"));
contactTabMedia.addEventListener("click", () => switchContactTab("media"));

async function fetchMedia() {
  if (!selectedUser) return;
  try {
    const r = await authFetch(`/api/media?with=${encodeURIComponent(selectedUser.userId)}`, { credentials: "include" });
    if (!r.ok) throw new Error("media fetch failed");
    const data = await r.json();
    currentMediaCache = data.media || [];
    renderMedia(currentMediaCache);
  } catch (e) {
    console.warn("[app] fetchMedia:", e);
  }
}

function renderMedia(media) {
  const images = media.filter(m => m.mediaType?.startsWith("image/")).map(m => ({ ...m, url: fileUrl(m.id) }));
  const audios = media.filter(m => m.mediaType?.startsWith("audio/"));
  const videos = media.filter(m => m.mediaType?.startsWith("video/"));

  contactMediaImages.innerHTML = "";
  contactMediaAudios.innerHTML = "";
  contactMediaVideos.innerHTML = "";

  contactMediaImagesSection.hidden = images.length === 0;
  contactMediaAudioSection.hidden = audios.length === 0;
  contactMediaVideoSection.hidden = videos.length === 0;
  contactMediaEmpty.hidden = !(images.length === 0 && audios.length === 0 && videos.length === 0);

  for (const m of videos) {
    contactMediaVideos.appendChild(createVideoBubble(m));
  }

  for (const m of images) {
    const img = document.createElement("img");
    setAuthedSrc(img, fileUrl(m.id), { lazy: true });
    img.alt = "";
    img.addEventListener("click", () => openLightbox(m.id, images));
    contactMediaImages.appendChild(img);
  }

  for (const m of audios) {
    const row = document.createElement("div");
    row.className = "contact-media-audio-row";
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    setAuthedSrc(audio, fileUrl(m.id), { lazy: true });
    const duration = document.createElement("span");
    duration.className = "dm-audio-duration";
    duration.textContent = m.mediaDurationMs ? formatAudioDuration(m.mediaDurationMs) : "";
    row.appendChild(audio);
    row.appendChild(duration);
    contactMediaAudios.appendChild(row);
  }
}

function openContactPanel() {
  if (!selectedUser) return;
  closeBubble();
  closeDrawer();
  currentContact = selectedUser;
  contactPanelOpen = true;
  contactPanel.hidden = false;
  contactPanelOverlay.hidden = false;
  if (window.innerWidth <= 768) {
    requestAnimationFrame(() => {
      contactPanel.classList.add("open");
    });
  } else {
    contactPanel.classList.remove("open");
  }
  switchContactTab("info");
  populateContactPanel();
  setTimeout(() => contactPanelClose.focus(), 0);
}

function closeContactPanel() {
  contactPanel.classList.remove("open");
  contactPanelOpen = false;
  currentContact = null;
  if (window.innerWidth <= 768) {
    setTimeout(() => {
      contactPanel.hidden = true;
      contactPanelOverlay.hidden = true;
    }, 260);
  } else {
    contactPanel.hidden = true;
    contactPanelOverlay.hidden = true;
  }
}

function populateContactPanel() {
  if (!selectedUser) return;
  contactName.textContent = displayName(selectedUser);
  contactHandle.textContent = `@${selectedUser.username}`;
  contactStatus.textContent = STATUS_LABELS[userStatus(selectedUser)];
  contactStatus.className = `contact-panel-status ${userStatus(selectedUser)}`;
  setAvatarOrFallback(contactPanelAvatar, selectedUser.userId, selectedUser.hasAvatar, "");
  contactLastSeen.textContent = "";

  const targetId = selectedUser.userId;
  authFetch(`/api/contact?targetUserId=${encodeURIComponent(selectedUser.userId)}`, { credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      if (!currentContact || currentContact.userId !== targetId) return;
      contactName.textContent = data.showname || data.username || displayName(selectedUser);
      contactHandle.textContent = data.username ? `@${data.username}` : `@${selectedUser.username}`;
      if (data.online != null) {
        contactStatus.textContent = STATUS_LABELS[userStatus(data)];
        contactStatus.className = `contact-panel-status ${userStatus(data)}`;
      }
      contactAccountCreatedValue.textContent = data.accountCreatedAt
        ? new Date(data.accountCreatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "";
      contactFriendsSinceValue.textContent = data.friendsSince
        ? new Date(data.friendsSince).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "";
      contactFirstConversationValue.textContent = data.firstConversationAt
        ? new Date(data.firstConversationAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "";
      contactAccountCreatedRow.hidden = !data.accountCreatedAt;
      contactFriendsSinceRow.hidden = !data.friendsSince;
      contactFirstConversationRow.hidden = !data.firstConversationAt;
      contactInfoList.hidden = contactAccountCreatedRow.hidden && contactFriendsSinceRow.hidden && contactFirstConversationRow.hidden;
      contactPanelUnfriend.hidden = !data.friendsSince;
      contactLastSeen.textContent = data.lastSeenAt
        ? `Visto por último em ${formatDayLabel(data.lastSeenAt)} às ${new Date(data.lastSeenAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : "";
    })
    .catch((e) => console.warn("[app] contact info:", e));
}

dmHeader.addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  e.stopPropagation();
  openContactPanel();
});

contactPanelClose.addEventListener("click", closeContactPanel);
contactPanelOverlay.addEventListener("click", closeContactPanel);

async function unfriendContact() {
  if (!selectedUser) return;
  if (!confirm("Deseja desfazer a amizade?")) return;
  try {
    const r = await authFetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "unfriend", targetUserId: selectedUser.userId }),
    });
    if (!r.ok) throw new Error("unfriend failed");
    social.friendIds.delete(selectedUser.userId);
    social.friendSince.delete(selectedUser.userId);
    await fetchSocial();
    closeContactPanel();
    trackAppActivity("unfriend");
  } catch (e) {
    console.warn("[app] unfriend:", e);
  }
}

contactPanelUnfriend.addEventListener("click", unfriendContact);

// ── Public rooms ────────────────────────────────────────────────────────
function fillString(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

/** ["A"] → "A", ["A","B"] → "A e B", ["A","B","C"] → "A, B e C". */
function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${STRINGS.listAnd}${items[items.length - 1]}`;
}

/** The one place the ban sentence is built, from the server's { all, rooms }. */
function banMessage({ all, rooms }) {
  if (all) return STRINGS.bannedAll;
  if (rooms.length === 1) return fillString(STRINGS.bannedOne, { room: rooms[0] });
  return fillString(STRINGS.bannedMany, { rooms: joinList(rooms) });
}

function setMyRoomState(data) {
  if (data?.bans) {
    myBans = { all: !!data.bans.all, rooms: Array.isArray(data.bans.rooms) ? data.bans.rooms : [] };
  }
  if (typeof data?.role === "string") myRole = data.role;
  if (Array.isArray(data?.rooms)) roomNames = data.rooms;
}

function amMod() {
  return myRole === "mod" || myRole === "owner";
}

function bannedFromRoom(room) {
  return myBans.all || myBans.rooms.includes(room);
}

/** Rooms plus the caller's own bans and role, straight from the server. */
async function fetchRoomState() {
  try {
    const r = await authFetch("/api/rooms?type=list", { credentials: "include" });
    if (!r.ok) throw new Error(`rooms list ${r.status}`);
    setMyRoomState(await r.json());
    renderRooms();
    return true;
  } catch (e) {
    console.warn("[app] fetchRoomState:", e);
    return false;
  }
}

function renderRooms() {
  roomList.innerHTML = "";
  for (const name of roomNames) {
    const row = document.createElement("div");
    row.className = "user-row room-row";
    row.dataset.room = name;
    row.setAttribute("role", "listitem");
    row.tabIndex = 0;
    if (name === currentRoom) row.classList.add("active");

    const icon = document.createElement("span");
    icon.className = "user-row-avatar";
    const glyph = document.createElement("i");
    glyph.className = `bi ${ROOM_ICONS[name] || ROOM_ICON_FALLBACK}`;
    glyph.setAttribute("aria-hidden", "true");
    icon.appendChild(glyph);

    const label = document.createElement("span");
    label.className = "username";
    label.textContent = name;

    row.appendChild(icon);
    row.appendChild(label);

    if (bannedFromRoom(name)) {
      row.classList.add("banned");
      const mark = document.createElement("i");
      mark.className = "bi bi-slash-circle room-row-banned";
      mark.title = STRINGS.roomBannedRow;
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", STRINGS.roomBannedRow);
      row.appendChild(mark);
    }

    row.addEventListener("click", () => openRoom(name));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openRoom(name);
      }
    });
    roomList.appendChild(row);
  }
}

function setComposerDisabled(disabled) {
  dmInput.disabled = disabled;
  dmSend.disabled = disabled;
  dmEmojiBtn.disabled = disabled;
  dmAttach.disabled = disabled;
}

function resetRoomMessages() {
  roomMessages = [];
  roomLastId = null;
  roomOldestId = null;
  roomNoMoreOlder = false;
  roomLoadingOlder = false;
}

// Not dismissable by design: no close button, no Escape, no backdrop. It goes
// away only when the user opens a DM or a room they are not banned from.
function showBanPopup() {
  roomBanned = true;
  if (imgTarget?.kind === "room") closeImagePreview({ all: true });
  stopRoomPoll();
  resetRoomMessages();
  dmMessages.innerHTML = "";
  dmMessages.classList.remove("loading-older");
  dmTyping.textContent = "";
  clearReply();
  closeReactionPopovers();
  closeModMenu();
  closeModConfirm(false);
  dmPanel.classList.add("room-banned");
  setComposerDisabled(true);
  roomBanTitle.textContent = STRINGS.bannedTitle;
  roomBanMessage.textContent = banMessage(myBans);
  roomBan.hidden = false;
  roomBan.focus({ preventScroll: true });
}

function hideBanPopup() {
  roomBanned = false;
  roomBan.hidden = true;
  dmPanel.classList.remove("room-banned");
  setComposerDisabled(false);
}

/** Called when leaving a room for a DM. */
function leaveRoom() {
  if (!currentRoom && !dmPanel.classList.contains("room-mode")) return;
  currentRoom = null;
  roomEpoch++;
  if (imgTarget?.kind === "room") closeImagePreview({ all: true });
  stopRoomPoll();
  resetRoomMessages();
  closeModMenu();
  closeModConfirm(false);
  hideBanPopup();
  clearReply();
  dmPanel.classList.remove("room-mode");
  renderRooms();
}

async function openRoom(name) {
  trackAppActivity("open_room");
  if (imgTarget && imgTarget.kind !== "avatar") closeImagePreview({ all: true });
  closeBubble();
  closeReactBar();
  closeEmojiPicker();
  closeModMenu();
  if (contactPanelOpen) closeContactPanel();
  if (audioRecording || recordingIntent) stopAudioRecording(false);

  // Leave the DM (if any): stop its polling and invalidate its pending requests.
  stopPoll();
  stopRoomPoll();
  selectedUser = null;
  conversationEpoch++;
  messageList = [];
  for (const el of userList.querySelectorAll(".user-row.active")) el.classList.remove("active");

  currentRoom = name;
  const epoch = ++roomEpoch;
  resetRoomMessages();
  hideBanPopup();
  clearReply();

  dmPlaceholder.hidden = true;
  dmPanel.hidden = false;
  dmPanel.classList.add("room-mode");
  dmUsername.textContent = name;
  delete dmUsername.dataset.userid;
  dmHeaderAvatar.innerHTML = "";
  const glyph = document.createElement("i");
  glyph.className = `bi ${ROOM_ICONS[name] || ROOM_ICON_FALLBACK}`;
  glyph.setAttribute("aria-hidden", "true");
  dmHeaderAvatar.appendChild(glyph);
  dmTyping.textContent = "";
  dmMessages.innerHTML = "";
  dmMessages.classList.remove("loading-older");
  setInitialLoading(true);
  renderRooms();
  closeDrawer();

  // Never trust the cached bans: ask the server before showing anything.
  const fresh = await fetchRoomState();
  if (epoch !== roomEpoch) return;
  if (fresh && bannedFromRoom(name)) {
    showBanPopup();
    return;
  }

  // If the state request failed, the messages request still enforces the ban (403).
  await pollRoom();
  if (epoch !== roomEpoch || roomBanned) return;
  startRoomPoll();
}

/**
 * Every room request goes through here. A 403 { error: "banned" } updates the
 * local bans and, if it concerns the open room, shows the ban popup at once.
 */
async function roomRequest(url, options = {}) {
  const r = await authFetch(url, { credentials: "include", ...options });
  const data = await r.json().catch(() => ({}));
  const banned = r.status === 403 && data.error === "banned";
  if (banned) {
    myBans = { all: !!data.all, rooms: Array.isArray(data.rooms) ? data.rooms : [] };
    renderRooms();
    if (currentRoom && bannedFromRoom(currentRoom) && !roomBanned) showBanPopup();
  }
  return { r, data, banned };
}

function roomPost(body) {
  return roomRequest("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sortRoomMessages() {
  roomMessages.sort((a, b) => a.id - b.id);
}

function markRoomMessageDeleted(id) {
  const idx = roomMessages.findIndex(m => m.id === id);
  if (idx === -1 || roomMessages[idx].deleted) return false;
  roomMessages[idx] = { id, deleted: true, createdAt: roomMessages[idx].createdAt };
  for (const m of roomMessages) {
    if (m.replyTo?.id === id) m.replyTo = { id, deleted: true, content: null, senderUsername: null, mediaType: null };
  }
  if (replyingTo?.id === id) clearReply();
  return true;
}

async function pollRoom() {
  if (!currentRoom || roomBanned || document.visibilityState !== "visible") return;
  if (roomPollBusyEpoch === roomEpoch) return;

  const room = currentRoom;
  const epoch = roomEpoch;
  roomPollBusyEpoch = epoch;

  try {
    const initial = roomLastId == null;
    const url = `/api/rooms?type=messages&room=${encodeURIComponent(room)}`
      + (initial ? `&limit=${MESSAGE_PAGE_LIMIT}` : `&after=${encodeURIComponent(roomLastId)}`);
    const { r, data, banned } = await roomRequest(url);
    if (epoch !== roomEpoch || banned) return;
    if (!r.ok) throw new Error(`room messages ${r.status}`);

    const fetched = data.messages || [];

    if (initial) {
      roomMessages = fetched.slice();
      sortRoomMessages();
      if (roomMessages.length) {
        roomOldestId = roomMessages[0].id;
        roomLastId = roomMessages[roomMessages.length - 1].id;
      }
      roomNoMoreOlder = fetched.length < MESSAGE_PAGE_LIMIT;
      renderRoomMessages({ scroll: "bottom" });
      return;
    }

    let changed = false;
    const known = new Set(roomMessages.map(m => m.id));
    const fresh = fetched.filter(m => !known.has(m.id));
    if (fresh.length) {
      roomMessages = roomMessages.concat(fresh);
      sortRoomMessages();
      changed = true;
    }
    for (const m of fetched) {
      if (roomLastId == null || m.id > roomLastId) roomLastId = m.id;
    }

    // Deletions and reaction changes on messages already on screen.
    const byId = new Map(roomMessages.map(m => [m.id, m]));
    for (const state of data.recent || []) {
      const local = byId.get(state.id);
      if (!local || local.deleted) continue;
      if (state.deleted) {
        if (markRoomMessageDeleted(state.id)) changed = true;
      } else if (!local.reactionPending && reactionsKey(local) !== JSON.stringify(state.reactions || [])) {
        local.reactions = state.reactions || [];
        changed = true;
      }
    }

    if (changed) renderRoomMessages({ scroll: "auto" });
  } catch (e) {
    console.warn("[app] pollRoom:", e);
    if (epoch === roomEpoch) setInitialLoading(false);
  } finally {
    if (roomPollBusyEpoch === epoch) roomPollBusyEpoch = -1;
  }
}

function startRoomPoll() {
  pollRoom();
  if (roomPollInterval) return;
  roomPollInterval = setInterval(pollRoom, ROOM_POLL_MS);
}

function stopRoomPoll() {
  if (roomPollInterval) {
    clearInterval(roomPollInterval);
    roomPollInterval = null;
  }
}

async function loadOlderRoom() {
  if (!currentRoom || roomBanned || roomNoMoreOlder || roomLoadingOlder) return;
  if (roomMessages.length === 0 || roomOldestId == null) return;

  const room = currentRoom;
  const epoch = roomEpoch;
  roomLoadingOlder = true;
  showOlderLoader(true);

  try {
    const { r, data, banned } = await roomRequest(
      `/api/rooms?type=messages&room=${encodeURIComponent(room)}&before=${encodeURIComponent(roomOldestId)}&limit=${MESSAGE_PAGE_LIMIT}`
    );
    if (epoch !== roomEpoch || banned) return;
    if (!r.ok) throw new Error(`older room messages ${r.status}`);

    const older = data.messages || [];
    if (older.length === 0) {
      roomNoMoreOlder = true;
      return;
    }

    showOlderLoader(false);
    const oldScrollHeight = dmMessages.scrollHeight;
    const oldScrollTop = dmMessages.scrollTop;

    const known = new Set(roomMessages.map(m => m.id));
    roomMessages = older.filter(m => !known.has(m.id)).concat(roomMessages);
    sortRoomMessages();
    roomOldestId = roomMessages[0].id;
    roomNoMoreOlder = older.length < MESSAGE_PAGE_LIMIT;

    renderRoomMessages({ scroll: "preserve" });
    dmMessages.scrollTop = oldScrollTop + (dmMessages.scrollHeight - oldScrollHeight);
  } catch (e) {
    console.warn("[app] loadOlderRoom:", e);
  } finally {
    if (epoch === roomEpoch) {
      roomLoadingOlder = false;
      showOlderLoader(false);
    }
  }
}

async function sendRoomMessage() {
  if (!currentRoom || roomBanned || roomSending) return;
  const content = String(dmInput.value).trim();
  if (!content) return;
  if (content.length > ROOM_MAX_LENGTH) {
    showImageError(STRINGS.roomTooLong);
    return;
  }
  trackAppActivity("send_message");

  const room = currentRoom;
  const epoch = roomEpoch;
  const reply = replyingTo ? { ...replyingTo } : null;

  roomSending = true;
  dmSend.disabled = true;
  dmInput.value = "";
  autoResizeInput();

  try {
    const { r, data, banned } = await roomPost({ action: "send", room, content, replyToId: reply?.id });
    if (epoch !== roomEpoch || banned) return;
    if (!r.ok || !data.message?.id) {
      // 429 carries a pt-BR message from the server; show it as-is.
      throw new Error(r.status === 429 && data.error ? data.error : STRINGS.roomSendFailed);
    }

    // roomLastId is left alone on purpose: the next poll (after=<roomLastId>)
    // must still return messages others posted just before this one.
    if (!roomMessages.some(m => m.id === data.message.id)) {
      roomMessages.push(data.message);
      sortRoomMessages();
    }
    if (roomOldestId == null) roomOldestId = roomMessages[0].id;
    if (replyingTo?.id === reply?.id) clearReply();
    renderRoomMessages({ scroll: "bottom" });
  } catch (e) {
    console.warn("[app] sendRoomMessage:", e);
    if (epoch !== roomEpoch) return;
    if (!dmInput.value) {
      dmInput.value = content;
      autoResizeInput();
    }
    showImageError(e.message || STRINGS.roomSendFailed);
  } finally {
    roomSending = false;
    if (!roomBanned) dmSend.disabled = false;
  }
}

function roomSenderName(m) {
  return m.senderShowname || m.senderUsername || "?";
}

const roomReactions = {
  react: (message, emoji) => reactToRoomMessage(message, emoji),
  nameOf: (userId) => {
    const sender = roomMessages.find(m => m.senderId === userId);
    if (sender) return roomSenderName(sender);
    const cached = usersCache.find(u => u.userId === userId);
    return cached ? displayName(cached) : "?";
  },
};

async function reactToRoomMessage(message, emoji) {
  if (!me || !currentRoom || roomBanned || message.deleted) return;
  const epoch = roomEpoch;
  const previous = message.reactions || [];
  const others = previous.filter(r => r.userId !== me.userId);
  message.reactions = emoji ? [...others, { userId: me.userId, emoji }] : others;
  message.reactionPending = true;
  if (emoji) rememberEmoji(emoji);
  renderRoomMessages({ scroll: "auto" });
  trackAppActivity("react_message");

  try {
    const { r, data, banned } = await roomPost(
      emoji ? { action: "react", messageId: message.id, emoji } : { action: "unreact", messageId: message.id }
    );
    if (banned) return;
    if (!r.ok) throw new Error(r.status === 429 && data.error ? data.error : STRINGS.roomReactFailed);
    message.reactions = data.reactions || [];
  } catch (e) {
    console.warn("[app] room react:", e);
    message.reactions = previous;
    if (epoch === roomEpoch) showImageError(e.message || STRINGS.roomReactFailed);
  } finally {
    message.reactionPending = false;
  }
  if (epoch === roomEpoch && roomMessages.includes(message)) renderRoomMessages({ scroll: "auto" });
}

function openSenderBubble(m, e) {
  e.stopPropagation(); // keep the document click-outside handler from closing it again
  closeReactionPopovers();
  closeModMenu();
  if (m.senderId === me.userId) {
    openBubble(me);
    return;
  }
  const cached = usersCache.find(u => u.userId === m.senderId);
  openBubble(cached || {
    userId: m.senderId,
    username: m.senderUsername,
    showname: m.senderShowname || null,
    hasAvatar: !!m.senderHasAvatar,
    nameColor: m.senderNameColor || null,
  });
}

function renderRoomMessages(options = {}) {
  const scrollMode = options.scroll || "bottom";
  setInitialLoading(false);

  let wasNearBottom = false;
  let oldScrollTop = 0;
  if (scrollMode === "auto") {
    const distanceToBottom = dmMessages.scrollHeight - dmMessages.scrollTop - dmMessages.clientHeight;
    wasNearBottom = distanceToBottom <= NEAR_BOTTOM_THRESHOLD;
    oldScrollTop = dmMessages.scrollTop;
  }

  dmMessages.innerHTML = "";

  if (!roomMessages.length) {
    const empty = document.createElement("div");
    empty.className = "room-empty";
    empty.textContent = STRINGS.roomEmpty;
    dmMessages.appendChild(empty);
    return;
  }

  const mod = amMod();
  let previousDayKey = null;

  for (const m of roomMessages) {
    const msgDate = new Date(m.createdAt);
    const dayKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
    if (dayKey !== previousDayKey) {
      const separator = document.createElement("div");
      separator.className = "dm-day-separator";
      separator.textContent = formatDayLabel(m.createdAt);
      dmMessages.appendChild(separator);
      previousDayKey = dayKey;
    }

    if (m.deleted) {
      const gone = document.createElement("div");
      gone.className = "room-deleted";
      gone.dataset.id = m.id;
      gone.textContent = STRINGS.roomDeleted;
      dmMessages.appendChild(gone);
      continue;
    }

    const isOwn = m.senderId === me.userId;
    const name = roomSenderName(m);

    const row = document.createElement("div");
    row.className = `room-msg ${isOwn ? "own" : "other"}`;

    const avatar = document.createElement("button");
    avatar.type = "button";
    avatar.className = "room-msg-avatar";
    avatar.setAttribute("aria-label", fillString(STRINGS.roomViewProfile, { name }));
    setAvatarOrFallback(avatar, m.senderId, m.senderHasAvatar, "");
    avatar.addEventListener("click", (e) => openSenderBubble(m, e));
    row.appendChild(avatar);

    const bubble = document.createElement("div");
    bubble.className = `dm-bubble ${isOwn ? "own" : "other"}${m.mediaType ? " media" : ""}`;
    bubble.dataset.id = m.id;

    const sender = document.createElement("div");
    sender.className = "room-sender";
    const senderName = document.createElement("button");
    senderName.type = "button";
    senderName.className = "room-sender-name";
    senderName.textContent = name;
    applyNameColor(senderName, nameColorOf(m.senderId, m.senderNameColor));
    senderName.addEventListener("click", (e) => openSenderBubble(m, e));
    sender.appendChild(senderName);
    if (m.senderIsMod) {
      const badge = document.createElement("span");
      badge.className = "room-mod-badge";
      badge.textContent = STRINGS.roomModBadge;
      badge.title = STRINGS.roomModBadgeLabel;
      sender.appendChild(badge);
    }
    bubble.appendChild(sender);

    if (m.replyTo) {
      const quote = document.createElement("div");
      quote.className = "dm-quote";
      quote.dataset.id = m.replyTo.id;

      const quoteName = document.createElement("div");
      quoteName.className = "dm-quote-name";
      quoteName.textContent = m.replyTo.senderUsername || "";

      const quoteText = document.createElement("div");
      quoteText.className = "dm-quote-text";
      appendLinkifiedText(snippet(m.replyTo), quoteText);

      quote.appendChild(quoteName);
      quote.appendChild(quoteText);
      quote.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToMessage(m.replyTo.id);
      });
      bubble.appendChild(quote);
    }

    if (m.mediaType?.startsWith("image/")) {
      bubble.appendChild(createImageBubble(roomImageUrl(m.id)));
    }

    if (m.content) {
      const text = document.createElement("div");
      text.className = "dm-bubble-text";
      appendLinkifiedText(m.content, text);
      bubble.appendChild(text);
    }

    const meta = document.createElement("div");
    meta.className = "dm-meta";
    const time = document.createElement("span");
    time.className = "dm-meta-time";
    time.textContent = msgDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    meta.appendChild(time);
    bubble.appendChild(meta);

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "dm-reply-btn";
    replyBtn.setAttribute("aria-label", "Responder");
    replyBtn.innerHTML = '<i class="bi bi-reply"></i>';
    replyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setReply({ id: m.id, senderId: m.senderId, senderUsername: name, content: m.content, mediaType: m.mediaType || null });
    });
    bubble.appendChild(replyBtn);

    const reactBtn = document.createElement("button");
    reactBtn.type = "button";
    reactBtn.className = "dm-react-btn";
    reactBtn.setAttribute("aria-label", "Reagir");
    reactBtn.innerHTML = '<i class="bi bi-emoji-smile"></i>';
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openReactBar(m, reactBtn, isOwn, roomReactions);
    });
    bubble.appendChild(reactBtn);

    // Shown to mods only; the server checks every action regardless.
    if (mod) {
      const modBtn = document.createElement("button");
      modBtn.type = "button";
      modBtn.className = "room-mod-btn";
      modBtn.setAttribute("aria-label", STRINGS.modMenuOpen);
      modBtn.setAttribute("aria-haspopup", "menu");
      modBtn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
      modBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openModMenu(m, modBtn, isOwn);
      });
      bubble.appendChild(modBtn);
    }

    if (m.reactions?.length) {
      bubble.classList.add("has-reactions");
      bubble.appendChild(createReactionsPill(m, roomReactions));
    }

    row.appendChild(bubble);
    dmMessages.appendChild(row);
  }

  if (scrollMode === "bottom" || (scrollMode === "auto" && wasNearBottom)) {
    dmMessages.scrollTop = dmMessages.scrollHeight;
  } else if (scrollMode === "auto") {
    dmMessages.scrollTop = oldScrollTop;
  }
}

// ── Room moderation (mod / owner) ───────────────────────────────────────
function closeModMenu() {
  modMenuSeq++;
  roomModMenu.hidden = true;
  roomModMenu.innerHTML = "";
}

function addModMenuItem(label, icon, onClick, danger = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "menuitem");
  if (danger) btn.classList.add("danger");
  const glyph = document.createElement("i");
  glyph.className = `bi ${icon}`;
  glyph.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = label;
  btn.append(glyph, text);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeModMenu();
    onClick();
  });
  roomModMenu.appendChild(btn);
  return btn;
}

async function openModMenu(message, anchor, isOwn) {
  closeReactionPopovers();
  closeModMenu();
  if (!amMod() || !currentRoom) return;

  const seq = ++modMenuSeq;
  const room = currentRoom;
  const align = isOwn ? "end" : "start";

  addModMenuItem(STRINGS.modDelete, "bi-trash", () => deleteRoomMessage(message), true);
  roomModMenu.hidden = false;
  positionPopover(roomModMenu, anchor, align);
  if (isOwn) return;

  // Ban options depend on the sender's current bans, which only mods may read.
  const loading = document.createElement("div");
  loading.className = "room-mod-menu-note";
  loading.textContent = STRINGS.modLoading;
  roomModMenu.appendChild(loading);

  let info = null;
  try {
    const { r, data } = await roomRequest(`/api/rooms?type=bans&targetUserId=${encodeURIComponent(message.senderId)}`);
    if (r.ok) info = data;
  } catch (e) {
    console.warn("[app] mod bans lookup:", e);
  }
  if (seq !== modMenuSeq) return;
  loading.remove();

  if (info?.canModerate) {
    const username = info.username || message.senderUsername;
    const bans = info.bans || { all: false, rooms: [] };
    if (!bans.all && !bans.rooms.includes(room)) {
      addModMenuItem(STRINGS.modBanRoom, "bi-slash-circle", () => banRoomUser(message.senderId, username, [room]), true);
    }
    if (!bans.all) {
      addModMenuItem(STRINGS.modBanAll, "bi-x-octagon", () => banRoomUser(message.senderId, username, ["ALL"]), true);
    }
    if (bans.all || bans.rooms.length) {
      addModMenuItem(STRINGS.modUnban, "bi-arrow-counterclockwise", () => unbanRoomUser(message.senderId, username));
    }
  }
  positionPopover(roomModMenu, anchor, align);
}

/** In-app confirmation styled like the logout dialog. Resolves true / false. */
function confirmModAction({ title, message, okLabel }) {
  closeModConfirm(false);
  modConfirmTitle.textContent = title;
  modConfirmMessage.textContent = message;
  modConfirmOk.textContent = okLabel;
  modConfirmCancel.textContent = STRINGS.modCancel;
  modConfirmOverlay.hidden = false;
  modConfirm.hidden = false;
  modConfirmCancel.focus();
  return new Promise(resolve => { modConfirmResolve = resolve; });
}

function closeModConfirm(result) {
  modConfirmOverlay.hidden = true;
  modConfirm.hidden = true;
  const resolve = modConfirmResolve;
  modConfirmResolve = null;
  resolve?.(result);
}

modConfirmCancel.addEventListener("click", () => closeModConfirm(false));
modConfirmOverlay.addEventListener("click", () => closeModConfirm(false));
modConfirmOk.addEventListener("click", () => closeModConfirm(true));

function modErrorText(r) {
  return r.status === 403 ? STRINGS.modForbidden : STRINGS.modFailed;
}

async function deleteRoomMessage(message) {
  const epoch = roomEpoch;
  try {
    const { r, banned } = await roomPost({ action: "delete", messageId: message.id });
    if (banned || epoch !== roomEpoch) return;
    if (!r.ok) {
      showImageError(modErrorText(r));
      return;
    }
    if (markRoomMessageDeleted(message.id)) renderRoomMessages({ scroll: "auto" });
    trackAppActivity("mod_delete");
  } catch (e) {
    console.warn("[app] mod delete:", e);
    showImageError(STRINGS.modFailed);
  }
}

async function banRoomUser(targetUserId, username, rooms) {
  const all = rooms.includes("ALL");
  const ok = await confirmModAction({
    title: STRINGS.modBanTitle,
    message: all
      ? fillString(STRINGS.modBanAllConfirm, { user: username })
      : fillString(STRINGS.modBanRoomConfirm, { user: username, room: rooms[0] }),
    okLabel: STRINGS.modBanOk,
  });
  if (!ok) return;
  try {
    const { r, banned } = await roomPost({ action: "ban", targetUserId, rooms });
    if (banned) return;
    showImageError(r.ok ? fillString(STRINGS.modBanned, { user: username }) : modErrorText(r));
    if (r.ok) trackAppActivity("mod_ban");
  } catch (e) {
    console.warn("[app] mod ban:", e);
    showImageError(STRINGS.modFailed);
  }
}

async function unbanRoomUser(targetUserId, username) {
  const ok = await confirmModAction({
    title: STRINGS.modUnbanTitle,
    message: fillString(STRINGS.modUnbanConfirm, { user: username }),
    okLabel: STRINGS.modUnbanOk,
  });
  if (!ok) return;
  try {
    const { r, banned } = await roomPost({ action: "unban", targetUserId, rooms: ["ALL"] });
    if (banned) return;
    showImageError(r.ok ? fillString(STRINGS.modUnbanned, { user: username }) : modErrorText(r));
    if (r.ok) trackAppActivity("mod_unban");
  } catch (e) {
    console.warn("[app] mod unban:", e);
    showImageError(STRINGS.modFailed);
  }
}

// ── Account dashboard ("Minha conta") ───────────────────────────────────
// A full view over the app shell. The profile block reuses the sidebar flows
// (avatar picker, saveShowname); the email block talks to /api/email. The
// server never says whether an address belongs to someone else, so neither
// does anything here.
const ACCOUNT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LABELS = { user: "roleUser", mod: "roleMod", owner: "roleOwner" };

let accountData = null;        // last GET /api/me
let accountSeq = 0;            // bumped on open / close: stale async results are dropped
let accountEmailMode = "view"; // "view" | "form" | "code" | "remove"
let accountPendingEmail = null;
let accountStartPassword = "";  // in memory only, while the dashboard is open and a code is pending
let accountResendAt = 0;
let accountResendTimer = null;
let accountBusy = false;
const accountMessageTimers = new WeakMap();

/** Fills the static texts of injected markup from STRINGS (data-str, data-str-label, data-str-placeholder). */
function applyStrings(root) {
  for (const el of root.querySelectorAll("[data-str]")) el.textContent = STRINGS[el.dataset.str] ?? "";
  for (const el of root.querySelectorAll("[data-str-label]")) el.setAttribute("aria-label", STRINGS[el.dataset.strLabel] ?? "");
  for (const el of root.querySelectorAll("[data-str-placeholder]")) el.placeholder = STRINGS[el.dataset.strPlaceholder] ?? "";
}

function setAccountMessage(el, text, isError = true, clearAfterMs = 0) {
  clearTimeout(accountMessageTimers.get(el));
  el.textContent = text || "";
  el.className = `account-message${text ? (isError ? " error" : " success") : ""}`;
  if (text && clearAfterMs) {
    accountMessageTimers.set(el, setTimeout(() => setAccountMessage(el, ""), clearAfterMs));
  }
}

function formatAccountDate(iso, withTime = false) {
  if (!iso) return STRINGS.accountUnknown;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return STRINGS.accountUnknown;
  const date = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return fillString(STRINGS.accountDateTime, { date, time });
}

function renderAccountProfile() {
  if (!me) return;
  setAvatarOrFallback(accountAvatar, me.userId, me.hasAvatar, "");
  accountName.textContent = displayName(me);
  applyNameColor(accountName, me.nameColor);
  accountHandle.textContent = `@${me.username}`;
  accountAvatarBtn.textContent = me.hasAvatar ? STRINGS.accountAvatarEdit : STRINGS.accountAvatarAdd;
  accountShownameValue.textContent = me.showname || STRINGS.accountUnknown;
  accountShownameValue.classList.toggle("empty", !me.showname);
  accountShownameEdit.textContent = me.showname ? STRINGS.accountEdit : STRINGS.accountAdd;
  renderAccountNameColor();
}

// ── Name color (cosmetic) ───────────────────────────────────────────────
// Same rules as lib/cosmetics.js; the server checks again on save.
const NAME_COLOR_BACKGROUND = "#2a2a2a"; // lightest row/bubble background a name sits on
const NAME_COLOR_MIN_CONTRAST = 3;
const NAME_COLOR_DEFAULT = "#ffffff";    // what the picker shows when no color is set

let accountColorDraft;      // undefined = no edit in progress; null = default; "#rrggbb"
let accountColorBusy = false;
let accountColorWarning = false;

function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return "#" + [...v.slice(1)].map(c => c + c).join("");
  return null;
}

function hexLuminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** null when usable, else "format" or "contrast". */
function nameColorProblem(value) {
  const hex = normalizeHexColor(value);
  if (!hex) return "format";
  const [hi, lo] = [hexLuminance(hex), hexLuminance(NAME_COLOR_BACKGROUND)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05) < NAME_COLOR_MIN_CONTRAST ? "contrast" : null;
}

/** Paints a name; no color (or an invalid one) falls back to the stylesheet color. */
function applyNameColor(el, color) {
  el.style.color = normalizeHexColor(color) || "";
}

/** A user's current color: own from `me`, others from the user list (fresher than old messages). */
function nameColorOf(userId, fallback) {
  if (me && userId === me.userId) return me.nameColor || null;
  const cached = usersCache.find(u => u.userId === userId);
  return cached ? cached.nameColor || null : fallback || null;
}

function renderAccountNameColor() {
  if (!me) return;
  const allowed = !!me.nameColorAllowed;
  accountNameColorLocked.hidden = allowed;
  accountNameColorEditor.hidden = !allowed;
  if (!allowed) return;

  const saved = me.nameColor || null;
  const draft = accountColorDraft === undefined ? saved : accountColorDraft;
  accountNameColorSample.textContent = displayName(me);
  applyNameColor(accountNameColorSample, draft);
  const pickerValue = draft || NAME_COLOR_DEFAULT;
  if (accountColorPicker.value !== pickerValue) accountColorPicker.value = pickerValue;
  if (document.activeElement !== accountColorHex) accountColorHex.value = draft ? draft.toUpperCase() : "";
  accountColorHex.placeholder = STRINGS.nameColorDefault;

  const tooDark = !!draft && nameColorProblem(draft) === "contrast";
  if (tooDark) {
    setAccountMessage(accountColorMessage, STRINGS.nameColorTooDark);
    accountColorWarning = true;
  } else if (accountColorWarning) {
    setAccountMessage(accountColorMessage, "");
    accountColorWarning = false;
  }
  accountNameColorSample.classList.toggle("too-dark", tooDark);
  accountColorSave.disabled = accountColorBusy || draft === saved || tooDark;
  accountColorReset.disabled = accountColorBusy || (!saved && !draft);
}

function setAccountColorDraft(value) {
  accountColorDraft = value;
  renderAccountNameColor();
}

/** Repaints every name on screen after the own color changed. */
function refreshNameColors() {
  applyNameColor(profileName, me.nameColor);
  applyNameColor(accountName, me.nameColor);
  if (currentRoom && roomMessages.length) renderRoomMessages({ scroll: "auto" });
  if (bubbleUser) renderBubble();
}

async function saveNameColor(color) {
  if (accountColorBusy) return;
  accountColorBusy = true;
  accountColorWarning = false;
  setAccountMessage(accountColorMessage, "");
  renderAccountNameColor();
  try {
    const r = await authFetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "setNameColor", color }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 403) me.nameColorAllowed = false;
    if (!r.ok) throw new Error(data.error === "Color too dark" ? STRINGS.nameColorTooDark : STRINGS.nameColorFailed);
    me.nameColor = data.nameColor || null;
    accountColorDraft = undefined;
    setAccountMessage(accountColorMessage, STRINGS.nameColorSaved, false, 3000);
    trackAppActivity("update_profile");
    refreshNameColors();
  } catch (e) {
    console.warn("[app] save name color:", e);
    setAccountMessage(accountColorMessage, e.message || STRINGS.nameColorFailed);
  } finally {
    accountColorBusy = false;
    renderAccountNameColor();
  }
}

accountColorPicker.addEventListener("input", () => setAccountColorDraft(normalizeHexColor(accountColorPicker.value)));
accountColorHex.addEventListener("input", () => {
  const raw = accountColorHex.value.trim();
  const typed = raw && !raw.startsWith("#") ? `#${raw}` : raw;
  if (!typed) setAccountColorDraft(null);
  else if (/^#[0-9a-f]{6}$/i.test(typed)) setAccountColorDraft(typed.toLowerCase());
});
accountColorHex.addEventListener("change", () => {
  const raw = accountColorHex.value.trim();
  const hex = raw ? normalizeHexColor(raw.startsWith("#") ? raw : `#${raw}`) : null;
  if (raw && !hex) {
    setAccountMessage(accountColorMessage, STRINGS.nameColorInvalid, true, 3000);
    accountColorHex.value = "";
    renderAccountNameColor();
    return;
  }
  setAccountColorDraft(hex);
  accountColorHex.value = hex ? hex.toUpperCase() : "";
});
accountColorHex.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  accountColorHex.blur(); // runs "change"
  if (!accountColorSave.disabled) accountColorSave.click();
});
accountColorSave.addEventListener("click", () => {
  const draft = accountColorDraft === undefined ? me.nameColor || null : accountColorDraft;
  saveNameColor(draft);
});
accountColorReset.addEventListener("click", () => saveNameColor(null));

function renderAccountDetails() {
  const d = accountData;
  const waiting = accountLoadError.hidden ? STRINGS.accountLoading : STRINGS.accountUnknown;
  accountMemberSince.textContent = d ? formatAccountDate(d.createdAt) : waiting;
  accountLastLogin.textContent = d ? formatAccountDate(d.lastLoginAt, true) : waiting;
  accountFriends.textContent = d ? String(d.friendsCount ?? 0) : waiting;

  // Role and bans come from the handshake first, then from /api/me.
  accountRole.textContent = STRINGS[ROLE_LABELS[myRole] || "roleUser"];
  const banned = myBans.all || myBans.rooms.length > 0;
  accountBans.textContent = banned ? banMessage(myBans) : STRINGS.bansNone;
  accountBans.classList.toggle("warn", banned);

  renderAccountEmail();
}

function renderAccountEmail() {
  const d = accountData;
  const available = !!d?.emailConfigured;
  // Without email configuration only "remove" is left: it sends nothing.
  const mode = available || accountEmailMode === "remove" ? accountEmailMode : "view";
  const email = d?.email || null;

  accountEmailUnavailable.hidden = !d || available;
  accountEmailCurrent.hidden = !!d && !available && !email;
  accountEmailValue.textContent = !d ? STRINGS.accountLoading : (email || STRINGS.emailNone);
  accountEmailValue.classList.toggle("empty", !email);
  accountEmailBadge.hidden = !email;
  accountEmailNoneNote.hidden = !available || !!email || mode !== "view";

  accountEmailAdd.hidden = !available || mode !== "view";
  accountEmailAdd.textContent = email ? STRINGS.emailChange : STRINGS.emailAdd;
  accountEmailRemove.hidden = mode !== "view" || !email;

  accountEmailForm.hidden = mode !== "form";
  accountCodeForm.hidden = mode !== "code";
  accountRemoveForm.hidden = mode !== "remove";

  if (mode === "code") {
    accountCodeSent.textContent = fillString(STRINGS.emailCodeSent, { email: accountPendingEmail || "" });
    tickAccountResend();
  }
  accountEmailSend.disabled = accountBusy;
  accountCodeSubmit.disabled = accountBusy;
  accountRemoveSubmit.disabled = accountBusy;
}

function setAccountEmailMode(mode, { keepMessage = false } = {}) {
  accountEmailMode = mode;
  if (!keepMessage) setAccountMessage(accountEmailMessage, "");
  accountRemovePassword.value = "";
  accountEmailPassword.value = "";
  if (mode !== "code") accountStartPassword = "";
  renderAccountEmail();
  if (mode === "form") (accountEmailInput.value ? accountEmailPassword : accountEmailInput).focus();
  else if (mode === "code") accountCodeInput.focus();
  else if (mode === "remove") accountRemovePassword.focus();
}

function tickAccountResend() {
  const left = Math.ceil((accountResendAt - Date.now()) / 1000);
  if (left > 0) {
    accountCodeResend.disabled = true;
    accountCodeResend.textContent = fillString(STRINGS.emailResendIn, { seconds: left });
    if (!accountResendTimer && !accountView.hidden) accountResendTimer = setInterval(tickAccountResend, 500);
    return;
  }
  accountCodeResend.disabled = accountBusy;
  accountCodeResend.textContent = STRINGS.emailResend;
  clearInterval(accountResendTimer);
  accountResendTimer = null;
}

function startAccountResendCooldown(seconds) {
  accountResendAt = Date.now() + Math.max(1, Number(seconds) || 60) * 1000;
  tickAccountResend();
}

async function loadAccount() {
  const seq = ++accountSeq;
  accountLoadError.hidden = true;
  renderAccountDetails();
  try {
    const r = await authFetch("/api/me", { credentials: "include" });
    if (!r.ok) throw new Error(`me ${r.status}`);
    const data = await r.json();
    if (seq !== accountSeq || accountView.hidden) return;

    accountData = data;
    setMyRoomState(data);
    renderRooms();
    me.nameColorAllowed = !!data.nameColorAllowed;
    if ((data.nameColor || null) !== (me.nameColor || null)) {
      me.nameColor = data.nameColor || null;
      refreshNameColors();
    }
    renderAccountNameColor();
    if (data.emailConfigured && data.pendingEmail) {
      accountPendingEmail = data.pendingEmail;
      if (accountEmailMode === "view") accountEmailMode = "code";
    } else if (accountEmailMode === "code") {
      accountEmailMode = "view";
    }
    renderAccountDetails();
  } catch (e) {
    console.warn("[app] loadAccount:", e);
    if (seq !== accountSeq) return;
    accountLoadError.hidden = false;
    renderAccountDetails();
  }
}

function openAccount() {
  if (!me) return;
  trackAppActivity("open_account");
  closeBubble();
  closeReactionPopovers();
  closeEmojiPicker();
  closeModMenu();

  accountEmailMode = "view";
  accountShownameForm.hidden = true;
  accountShownameDisplay.hidden = false;
  accountColorDraft = undefined;
  accountColorWarning = false;
  setAccountMessage(accountColorMessage, "");
  setAccountMessage(accountProfileMessage, "");
  setAccountMessage(accountEmailMessage, "");
  accountView.hidden = false;
  accountScroll.scrollTop = 0;
  renderAccountProfile();
  accountClose.focus();
  loadAccount();
}

function closeAccount() {
  if (accountView.hidden) return;
  accountSeq++;
  accountView.hidden = true;
  accountColorDraft = undefined; // an unsaved color is dropped
  accountRemovePassword.value = "";
  accountEmailPassword.value = "";
  accountStartPassword = "";
  accountCodeInput.value = "";
  clearInterval(accountResendTimer);
  accountResendTimer = null;
  profileAccountBtn.focus();
}

async function emailRequest(body) {
  const r = await authFetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  // The server lost its email configuration: switch to the unavailable state.
  if (r.status === 503 && accountData) accountData.emailConfigured = false;
  return { r, data };
}

/** 429 / 502 / 503 carry a pt-BR sentence from the server; everything else gets a local one. */
function emailErrorText(r, data, fallback) {
  return [429, 502, 503].includes(r.status) && data.error ? data.error : fallback;
}

/** Runs one email action at a time; `fn` returns the message to show, if any. */
async function runEmailAction(fn) {
  if (accountBusy) return;
  accountBusy = true;
  renderAccountEmail();
  const seq = accountSeq;
  let failure = null;
  try {
    failure = await fn(() => seq !== accountSeq);
  } catch (e) {
    console.warn("[app] email action:", e);
    failure = STRINGS.emailFailed;
  } finally {
    accountBusy = false;
  }
  if (seq !== accountSeq) return;
  if (failure) setAccountMessage(accountEmailMessage, failure);
  renderAccountEmail();
}

/** The server asks for the current password on every "start", a resend included. */
function sendEmailCode(rawEmail, password, { resend = false } = {}) {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!ACCOUNT_EMAIL_RE.test(email) || email.length > 254) {
    setAccountMessage(accountEmailMessage, STRINGS.emailInvalid);
    return;
  }
  if (accountData?.email === email) {
    setAccountMessage(accountEmailMessage, STRINGS.emailSame);
    return;
  }
  if (!password) {
    setAccountMessage(accountEmailMessage, STRINGS.emailPasswordMissing);
    accountEmailPassword.focus();
    return;
  }

  return runEmailAction(async (stale) => {
    const { r, data } = await emailRequest({ action: "start", email, password });
    if (stale()) return null;
    if (r.status === 429 && data.retryAfterSec && accountEmailMode === "code") startAccountResendCooldown(data.retryAfterSec);
    if (r.status === 400) return STRINGS.emailInvalid;
    if (r.status === 409) return STRINGS.emailSame;
    if (r.status === 403) {
      // Wrong password: back to the form (a resend lands here if the password changed meanwhile).
      accountEmailInput.value = email;
      setAccountEmailMode("form");
      return STRINGS.emailPasswordWrong;
    }
    if (!r.ok) return emailErrorText(r, data, STRINGS.emailFailed);

    accountPendingEmail = data.pendingEmail || email;
    accountCodeInput.value = "";
    accountEmailInput.value = "";
    startAccountResendCooldown(data.cooldownSec);
    setAccountEmailMode("code");
    accountStartPassword = password;
    if (resend) setAccountMessage(accountEmailMessage, STRINGS.emailResent, false, 4000);
    trackAppActivity("email_start");
    return null;
  });
}

function confirmEmailCode() {
  const code = accountCodeInput.value.replace(/\D/g, "");
  if (code.length !== 6) {
    setAccountMessage(accountEmailMessage, STRINGS.emailCodeInvalid);
    return;
  }

  return runEmailAction(async (stale) => {
    const { r, data } = await emailRequest({ action: "confirm", code });
    if (stale()) return null;
    if (!r.ok) {
      accountCodeInput.value = "";
      accountCodeInput.focus();
      return r.status === 400 ? STRINGS.emailCodeInvalid : emailErrorText(r, data, STRINGS.emailFailed);
    }

    if (accountData) {
      accountData.email = data.email;
      accountData.emailVerified = true;
      accountData.pendingEmail = null;
    }
    accountPendingEmail = null;
    accountCodeInput.value = "";
    setAccountEmailMode("view");
    setAccountMessage(accountEmailMessage, STRINGS.emailVerified, false);
    trackAppActivity("email_confirm");
    return null;
  });
}

function removeAccountEmail() {
  const password = accountRemovePassword.value;
  if (!password) {
    setAccountMessage(accountEmailMessage, STRINGS.emailPasswordWrong);
    accountRemovePassword.focus();
    return;
  }

  return runEmailAction(async (stale) => {
    const { r, data } = await emailRequest({ action: "remove", password });
    if (stale()) return null;
    if (!r.ok) {
      accountRemovePassword.value = "";
      return r.status === 403 ? STRINGS.emailPasswordWrong : emailErrorText(r, data, STRINGS.emailFailed);
    }

    if (accountData) {
      accountData.email = null;
      accountData.emailVerified = false;
    }
    setAccountEmailMode("view");
    setAccountMessage(accountEmailMessage, STRINGS.emailRemoved, false);
    trackAppActivity("email_remove");
    return null;
  });
}

profileAccountBtn.addEventListener("click", openAccount);
accountClose.addEventListener("click", closeAccount);
accountRetry.addEventListener("click", loadAccount);
accountAvatar.addEventListener("click", openAvatarPicker);
accountAvatarBtn.addEventListener("click", openAvatarPicker);
accountLogout.addEventListener("click", openLogoutConfirm);

accountShownameEdit.addEventListener("click", () => {
  accountShownameInput.value = me?.showname || "";
  accountShownameDisplay.hidden = true;
  accountShownameForm.hidden = false;
  accountShownameInput.focus();
});

function closeAccountShownameForm() {
  accountShownameForm.hidden = true;
  accountShownameDisplay.hidden = false;
}

accountShownameCancel.addEventListener("click", closeAccountShownameForm);
accountShownameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (await saveShowname(accountShownameInput.value)) closeAccountShownameForm();
});

accountEmailAdd.addEventListener("click", () => {
  accountEmailInput.value = "";
  accountEmailUsername.value = me?.username || "";
  setAccountEmailMode("form");
});
accountEmailRemove.addEventListener("click", () => {
  accountRemoveUsername.value = me?.username || "";
  setAccountEmailMode("remove");
});
accountEmailFormCancel.addEventListener("click", () => setAccountEmailMode("view"));
accountRemoveCancel.addEventListener("click", () => setAccountEmailMode("view"));
accountCodeOther.addEventListener("click", () => {
  accountEmailInput.value = accountPendingEmail || "";
  setAccountEmailMode("form");
});
accountCodeResend.addEventListener("click", () => {
  if (accountStartPassword) {
    sendEmailCode(accountPendingEmail, accountStartPassword, { resend: true });
    return;
  }
  // The dashboard was reopened: the password is not kept, so ask for it again.
  accountEmailInput.value = accountPendingEmail || "";
  accountEmailUsername.value = me?.username || "";
  setAccountEmailMode("form");
  setAccountMessage(accountEmailMessage, STRINGS.emailPasswordAgain, false);
});

accountEmailForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendEmailCode(accountEmailInput.value, accountEmailPassword.value);
});
accountCodeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  confirmEmailCode();
});
accountRemoveForm.addEventListener("submit", (e) => {
  e.preventDefault();
  removeAccountEmail();
});

// Digits only; the sixth digit submits.
accountCodeInput.addEventListener("input", () => {
  const digits = accountCodeInput.value.replace(/\D/g, "").slice(0, 6);
  if (accountCodeInput.value !== digits) accountCodeInput.value = digits;
  if (digits.length === 6) confirmEmailCode();
});

// Close the emoji picker / reaction bar when clicking outside them.
document.addEventListener("click", (e) => {
  if (!dmReactBar.hidden && !dmReactBar.contains(e.target)) closeReactBar();
  if (!emojiPicker.hidden && !emojiPicker.contains(e.target) && !dmEmojiBtn.contains(e.target)) closeEmojiPicker();
  if (!roomModMenu.hidden && !roomModMenu.contains(e.target)) closeModMenu();
});

window.addEventListener("resize", () => {
  closeReactBar();
  closeEmojiPicker();
  closeModMenu();
});

// Close bubble when clicking outside.
document.addEventListener("click", (e) => {
  if (!bubbleUser) return;
  if (userBubble.contains(e.target)) return;
  const row = e.target.closest(".user-row");
  if (row && row.dataset.userid === bubbleUser.userId) return;
  closeBubble();
});

document.addEventListener("keydown", (e) => {
  // Image preview: Enter sends (applies in crop mode), Escape cancels (leaves crop mode).
  if (!imgPreview.hidden) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (imgBusy) return;
      if (imgCrop) cancelCrop();
      else cancelImage();
      return;
    }
    if (e.key === "Enter" && !e.isComposing && !e.target.closest?.("button")) {
      e.preventDefault();
      if (imgCrop) applyCrop();
      else sendCurrentImage();
    }
    return;
  }

  if (!dmLightbox.hidden && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    showLightboxImage(e.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  if (e.key !== "Escape") return;

  // The room ban popup (#room-ban) is deliberately absent here: it cannot be dismissed.
  if (!modConfirm.hidden) {
    e.preventDefault();
    closeModConfirm(false);
    return;
  }

  if (!roomModMenu.hidden) {
    e.preventDefault();
    closeModMenu();
    return;
  }

  if (!dmReactBar.hidden) {
    e.preventDefault();
    closeReactBar();
    return;
  }

  if (!emojiPicker.hidden) {
    e.preventDefault();
    const wasCompose = emojiPickerMode === "compose";
    closeEmojiPicker();
    if (wasCompose) dmInput.focus();
    return;
  }

  if (!logoutConfirm.hidden) {
    e.preventDefault();
    closeLogoutConfirm();
    return;
  }

  if (!accountView.hidden) {
    e.preventDefault();
    closeAccount();
    return;
  }

  if (contactPanelOpen) {
    e.preventDefault();
    closeContactPanel();
    return;
  }

  if (bubbleUser) {
    e.preventDefault();
    closeBubble();
    return;
  }

  if (!dmLightbox.hidden) {
    e.preventDefault();
    closeLightbox();
    return;
  }

  if (replyingTo) {
    e.preventDefault();
    clearReply();
    return;
  }

  if (drawerOpen) {
    e.preventDefault();
    closeDrawer();
  }
});

// Focus the message list when the user clicks inside the DM panel but outside interactive controls.
dmPanel.addEventListener("click", (e) => {
  if (
    e.target.closest("#dm-input") ||
    e.target.closest("button") ||
    e.target.closest("input")
  ) {
    return;
  }
  dmMessages.focus({ preventScroll: true });
});

// Smooth line-by-line scrolling with Up/Down arrows when the message list has focus.
dmMessages.addEventListener("keydown", (e) => {
  if (e.target !== dmMessages) return;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const delta = e.key === "ArrowUp" ? -48 : 48;
    dmMessages.scrollBy({ top: delta, behavior: "smooth" });
  }
});

dmMessages.addEventListener(
  "scroll",
  () => {
    closeReactionPopovers();
    closeModMenu();
    if (currentRoom) {
      if (roomBanned || roomNoMoreOlder || roomLoadingOlder || roomMessages.length === 0) return;
      if (dmMessages.scrollTop <= LOAD_OLDER_THRESHOLD) loadOlderRoom();
      return;
    }
    if (noMoreOlder || loadingOlder || messageList.length === 0) return;
    if (dmMessages.scrollTop <= LOAD_OLDER_THRESHOLD) {
      loadOlder();
    }
  },
  { passive: true }
);

// While idle, a keepalive every 30s keeps the user "away" (app open) instead of offline.
const PRESENCE_KEEPALIVE_MS = 30000;

async function maybeSendPresence() {
  const activity = window.__NAGORA_ACTIVITY__;
  const lastActivity = activity ? activity.lastActivityAt : 0;
  const active = !!lastActivity && lastActivity > lastPresenceAt && !amAway();
  if (!active && Date.now() - lastPresenceAt < PRESENCE_KEEPALIVE_MS) return;

  lastPresenceAt = Date.now();
  try {
    const r = await authFetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active }),
    });
    if (r.ok) {
      const data = await r.json();
      lastPresenceAnyFriendOnline = !!(data.onlineFriendsCount && data.onlineFriendsCount > 0);
    }
  } catch (e) {
    console.warn("[app] heartbeat:", e);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopPoll();
    stopRoomPoll();
  } else if (selectedUser) {
    startPoll();
    fetchSocial(); fetchIncomingBadge();
  } else if (currentRoom && !roomBanned) {
    startRoomPoll();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && audioRecording) stopAudioRecording(false);
});

// Back from away: messages that arrived in the open conversation become "Visualizada" now.
window.addEventListener("nagora:active", () => {
  if (!selectedUser || document.visibilityState !== "visible") return;
  if (!social.unread.has(selectedUser.userId)) return;
  markRead(selectedUser.userId);
  social.unread.delete(selectedUser.userId);
  renderUsers(usersCache);
  updateTitle();
});

applyStrings(document.body);

document.addEventListener("DOMContentLoaded", async () => {
  await initSession();
  if (!me) return;

  renderProfileSummary();
  fetchRoomState();
  await fetchSocial();
  fetchIncomingBadge();
  await fetchUnread();
  if (window.innerWidth <= 768 && !selectedUser) {
    openDrawer();
  }
  maybeSendPresence();
  setInterval(maybeSendPresence, 2000);
  unreadInterval = setInterval(fetchUnread, 2000);
});
