-- Tạo bảng categories
CREATE TABLE IF NOT EXISTS categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    parent_id uuid,
    image text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Tạo bảng suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    contact_info text,
    image text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

-- Tạo bảng users (cho auth)
CREATE TABLE IF NOT EXISTS users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    full_name character varying(255),
    role character varying(50) DEFAULT 'customer',
    status character varying(50) DEFAULT 'active',
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

-- Thêm user admin mặc định
INSERT INTO users (id, email, password_hash, full_name, role, status)
VALUES (gen_random_uuid(), 'admin@example.com', '$2b$10$kHt5Sdltje4RXwIqOZN9we...', 'Admin', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;
