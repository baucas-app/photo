-- Push-Tokens, Smart Albums, Tag-Gruppen

-- device_push_tokens
CREATE TABLE device_push_tokens (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'ios',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT device_push_tokens_token_key UNIQUE (token),
    CONSTRAINT device_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX device_push_tokens_user_id_idx ON device_push_tokens(user_id);

-- smart_albums
CREATE TABLE smart_albums (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rules JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT smart_albums_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX smart_albums_user_id_idx ON smart_albums(user_id);

-- tag_groups
CREATE TABLE tag_groups (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tag_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX tag_groups_user_id_idx ON tag_groups(user_id);

-- tag_group_labels
CREATE TABLE tag_group_labels (
    id TEXT NOT NULL PRIMARY KEY,
    tag_group_id TEXT NOT NULL,
    label TEXT NOT NULL,
    CONSTRAINT tag_group_labels_tag_group_id_label_key UNIQUE (tag_group_id, label),
    CONSTRAINT tag_group_labels_tag_group_id_fkey FOREIGN KEY (tag_group_id) REFERENCES tag_groups(id) ON DELETE CASCADE
);
