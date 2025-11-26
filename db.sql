--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-11-25 21:54:14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 17206)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 5370 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 316 (class 1255 OID 17217)
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
	new.updated_at = now();
	RETURN new;
end;
$$;


ALTER FUNCTION public.touch_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 272 (class 1259 OID 17218)
-- Name: ai_chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_chat_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    session_id uuid,
    role character varying(20),
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_chat_messages_role_check CHECK (((role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text])))
);


ALTER TABLE public.ai_chat_messages OWNER TO postgres;

--
-- TOC entry 273 (class 1259 OID 17226)
-- Name: ai_chat_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_chat_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    started_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    context jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.ai_chat_sessions OWNER TO postgres;

--
-- TOC entry 274 (class 1259 OID 17235)
-- Name: ai_recommendations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_recommendations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    context jsonb,
    items jsonb,
    model_version character varying(64),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.ai_recommendations OWNER TO postgres;

--
-- TOC entry 275 (class 1259 OID 17242)
-- Name: cart_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid,
    variant_id uuid,
    qty integer NOT NULL,
    price_snapshot numeric(12,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    size_snapshot character varying(32)
);


ALTER TABLE public.cart_items OWNER TO postgres;

--
-- TOC entry 276 (class 1259 OID 17248)
-- Name: carts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.carts OWNER TO postgres;

--
-- TOC entry 277 (class 1259 OID 17253)
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    parent_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    image text
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- TOC entry 278 (class 1259 OID 17261)
-- Name: favorite; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.favorite (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    seq bigint NOT NULL
);


ALTER TABLE public.favorite OWNER TO postgres;

--
-- TOC entry 279 (class 1259 OID 17266)
-- Name: favorite_seq_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.favorite_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.favorite_seq_seq OWNER TO postgres;

--
-- TOC entry 5377 (class 0 OID 0)
-- Dependencies: 279
-- Name: favorite_seq_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.favorite_seq_seq OWNED BY public.favorite.seq;


--
-- TOC entry 280 (class 1259 OID 17267)
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    total_amount numeric(12,2) NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0,
    shipping_fee numeric(12,2) DEFAULT 0,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    order_status character varying(20) DEFAULT 'pending'::character varying,
    shipping_address_snapshot jsonb,
    payment_method character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    final_amount numeric(12,2) NOT NULL,
    promotion_code character varying(50),
    promotion_id uuid,
    cancel_reason text,
    CONSTRAINT chk_order_status CHECK (((order_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('shipped'::character varying)::text, ('delivered'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT orders_payment_method_check CHECK (((payment_method)::text = ANY (ARRAY[('paypal'::character varying)::text, ('momo'::character varying)::text, ('vnpay'::character varying)::text, ('cod'::character varying)::text]))),
    CONSTRAINT orders_payment_status_check CHECK (((payment_status)::text = ANY (ARRAY[('unpaid'::character varying)::text, ('paid'::character varying)::text, ('failed'::character varying)::text])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- TOC entry 281 (class 1259 OID 17282)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    gateway character varying(20),
    amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'VND'::character varying,
    status character varying(20) DEFAULT 'init'::character varying,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    gateway_tx_id text,
    payer_id text,
    payer_email text,
    metadata jsonb DEFAULT '{}'::jsonb,
    raw_response jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT payments_gateway_check CHECK (((gateway)::text = ANY (ARRAY[('paypal'::character varying)::text, ('momo'::character varying)::text, ('vnpay'::character varying)::text]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY (ARRAY[('init'::character varying)::text, ('succeeded'::character varying)::text, ('failed'::character varying)::text, ('canceled'::character varying)::text])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 282 (class 1259 OID 17296)
-- Name: vw_revenue_by_day; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_revenue_by_day AS
 SELECT (date_trunc('day'::text, COALESCE(p.paid_at, o.created_at)))::date AS day,
    (sum(COALESCE(p.amount, o.final_amount, (0)::numeric)))::numeric(14,2) AS revenue,
    count(DISTINCT o.id) AS orders_count,
    count(p.id) FILTER (WHERE ((p.status)::text = 'succeeded'::text)) AS payments_count
   FROM (public.orders o
     LEFT JOIN public.payments p ON ((p.order_id = o.id)))
  WHERE (((p.status)::text = 'succeeded'::text) OR (p.id IS NULL))
  GROUP BY (date_trunc('day'::text, COALESCE(p.paid_at, o.created_at)))
  ORDER BY ((date_trunc('day'::text, COALESCE(p.paid_at, o.created_at)))::date);


ALTER VIEW public.vw_revenue_by_day OWNER TO postgres;

--
-- TOC entry 283 (class 1259 OID 17301)
-- Name: mv_revenue_by_week; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.mv_revenue_by_week AS
 SELECT (date_trunc('week'::text, (day)::timestamp with time zone))::date AS week_start,
    (sum(revenue))::numeric(18,2) AS revenue,
    (sum(orders_count))::bigint AS orders_count,
    (sum(payments_count))::bigint AS payments_count
   FROM public.vw_revenue_by_day
  GROUP BY (date_trunc('week'::text, (day)::timestamp with time zone))
  ORDER BY ((date_trunc('week'::text, (day)::timestamp with time zone))::date)
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.mv_revenue_by_week OWNER TO postgres;

--
-- TOC entry 284 (class 1259 OID 17305)
-- Name: news; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    image text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    content_blocks jsonb DEFAULT '[]'::jsonb
);


ALTER TABLE public.news OWNER TO postgres;

--
-- TOC entry 285 (class 1259 OID 17314)
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    variant_id uuid,
    qty integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    name_snapshot character varying(200),
    color_snapshot character varying(40),
    size_snapshot character varying(12),
    final_price numeric(12,2) NOT NULL,
    promo_applied boolean DEFAULT false,
    line_base numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- TOC entry 286 (class 1259 OID 17319)
-- Name: order_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.order_notifications OWNER TO postgres;

--
-- TOC entry 287 (class 1259 OID 17327)
-- Name: otp_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otp_verifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    otp text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.otp_verifications OWNER TO postgres;

--
-- TOC entry 288 (class 1259 OID 17334)
-- Name: product_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    url text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    variant_id uuid,
    "position" integer
);


ALTER TABLE public.product_images OWNER TO postgres;

--
-- TOC entry 289 (class 1259 OID 17341)
-- Name: product_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    sku character varying(255),
    color_name character varying(40),
    sizes jsonb,
    stock_qty integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    color_code character varying(32),
    sold_qty integer DEFAULT 0,
    CONSTRAINT chk_sold_qty_non_negative CHECK ((sold_qty >= 0))
);


ALTER TABLE public.product_variants OWNER TO postgres;

--
-- TOC entry 290 (class 1259 OID 17352)
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    category_id uuid,
    supplier_id uuid,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    price numeric(12,2) DEFAULT 0 NOT NULL,
    sale_percent numeric(5,2) DEFAULT 0,
    is_flash_sale boolean DEFAULT false,
    final_price integer GENERATED ALWAYS AS (round(
CASE
    WHEN (is_flash_sale AND (sale_percent > (0)::numeric)) THEN (price * ((1)::numeric - (sale_percent / 100.0)))
    ELSE price
END, 0)) STORED,
    sequence_id bigint NOT NULL,
    CONSTRAINT chk_flash_sale_percent CHECK ((((is_flash_sale = true) AND (sale_percent > (0)::numeric)) OR (is_flash_sale = false))),
    CONSTRAINT products_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text])))
);


ALTER TABLE public.products OWNER TO postgres;

--
-- TOC entry 291 (class 1259 OID 17367)
-- Name: products_sequence_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_sequence_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_sequence_id_seq OWNER TO postgres;

--
-- TOC entry 5387 (class 0 OID 0)
-- Dependencies: 291
-- Name: products_sequence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_sequence_id_seq OWNED BY public.products.sequence_id;


--
-- TOC entry 292 (class 1259 OID 17368)
-- Name: promotion_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promotion_products (
    promotion_id uuid NOT NULL,
    product_id uuid NOT NULL
);


ALTER TABLE public.promotion_products OWNER TO postgres;

--
-- TOC entry 293 (class 1259 OID 17371)
-- Name: promotions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150),
    type character varying(20),
    value numeric(9,2),
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    status character varying(20) DEFAULT 'active'::character varying,
    code character varying(25),
    description text,
    min_order_value numeric(12,2),
    usage_limit integer,
    used_count integer DEFAULT 0,
    max_discount_value numeric(12,2),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_promotion_type CHECK (((type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('amount'::character varying)::text]))),
    CONSTRAINT promotions_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text]))),
    CONSTRAINT promotions_type_check CHECK (((type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('amount'::character varying)::text])))
);


ALTER TABLE public.promotions OWNER TO postgres;

--
-- TOC entry 294 (class 1259 OID 17384)
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    revoked boolean DEFAULT false
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- TOC entry 295 (class 1259 OID 17392)
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    product_id uuid,
    rating integer,
    comment text,
    created_at timestamp without time zone DEFAULT now(),
    images jsonb DEFAULT '[]'::jsonb,
    updated_at timestamp without time zone DEFAULT now(),
    is_public boolean DEFAULT true,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- TOC entry 304 (class 1259 OID 17782)
-- Name: size_guides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.size_guides (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    category_id uuid,
    size_label character varying(10) NOT NULL,
    min_height integer,
    max_height integer,
    min_weight integer,
    max_weight integer,
    bust integer,
    waist integer,
    hip integer,
    foot_length integer,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.size_guides OWNER TO postgres;

--
-- TOC entry 296 (class 1259 OID 17403)
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    contact_email text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    logo_url text,
    phone character varying(20) DEFAULT NULL::character varying
);


ALTER TABLE public.suppliers OWNER TO postgres;

--
-- TOC entry 297 (class 1259 OID 17412)
-- Name: user_addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    receive_name character varying(150),
    phone character varying(20),
    address text,
    is_default boolean DEFAULT false,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(address, ''::text))) STORED,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tag character varying(50)
);


ALTER TABLE public.user_addresses OWNER TO postgres;

--
-- TOC entry 298 (class 1259 OID 17422)
-- Name: user_behavior_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_behavior_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    event_type character varying(32) NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_behavior_events OWNER TO postgres;

--
-- TOC entry 299 (class 1259 OID 17429)
-- Name: user_promotions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    action character varying(50) DEFAULT 'view'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    code character varying(255)
);


ALTER TABLE public.user_promotions OWNER TO postgres;

--
-- TOC entry 300 (class 1259 OID 17435)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(150) NOT NULL,
    password_hash character varying,
    full_name character varying(150),
    phone character varying(20),
    role character varying(20) DEFAULT 'customer'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    google_id character varying(255),
    name character varying(255),
    height integer,
    weight integer,
    bust integer,
    waist integer,
    hip integer,
    gender character varying(16),
    CONSTRAINT users_credential_present CHECK (((password_hash IS NOT NULL) OR (google_id IS NOT NULL))),
    CONSTRAINT users_password_not_empty CHECK (((password_hash IS NULL) OR (length((password_hash)::text) > 0))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('customer'::character varying)::text, ('admin'::character varying)::text]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('banned'::character varying)::text])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 302 (class 1259 OID 17707)
-- Name: v_item_document; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_item_document AS
 SELECT pv.id AS variant_id,
    p.id AS product_id,
    p.name AS product_name,
    pv.sku,
    pv.color_name,
    pv.sizes,
    pv.stock_qty,
    p.description,
    p.price,
    p.sale_percent,
    p.is_flash_sale,
    p.final_price,
    c.name AS category_name,
    s.name AS supplier_name,
    COALESCE(( SELECT json_agg(pi.url ORDER BY COALESCE(pi."position", 0)) AS json_agg
           FROM public.product_images pi
          WHERE ((pi.variant_id = pv.id) OR ((pi.product_id = p.id) AND (pi.variant_id IS NULL)))), '[]'::json) AS image_urls,
    (((((((((((COALESCE(p.name, ''::character varying))::text || ' || '::text) || COALESCE(p.description, ''::text)) || ' || Supplier: '::text) || (COALESCE(s.name, ''::character varying))::text) || ' || Category: '::text) || (COALESCE(c.name, ''::character varying))::text) || ' || Variant: '::text) || (COALESCE(pv.color_name, ''::character varying))::text) || ' || Sizes: '::text) || COALESCE((pv.sizes)::text, ''::text)) AS text_document,
    jsonb_build_object('variant_id', pv.id, 'product_id', p.id, 'product_name', p.name, 'sku', pv.sku, 'color_name', pv.color_name, 'sizes', pv.sizes, 'stock_qty', pv.stock_qty, 'price', p.price, 'sale_percent', p.sale_percent, 'is_flash_sale', p.is_flash_sale, 'final_price', p.final_price, 'category', c.name, 'supplier', s.name, 'images', COALESCE(( SELECT json_agg(json_build_object('url', pi.url, 'position', COALESCE(pi."position", 0)) ORDER BY COALESCE(pi."position", 0)) AS json_agg
           FROM public.product_images pi
          WHERE ((pi.variant_id = pv.id) OR ((pi.product_id = p.id) AND (pi.variant_id IS NULL)))), '[]'::json)) AS metadata
   FROM (((public.product_variants pv
     JOIN public.products p ON ((p.id = pv.product_id)))
     LEFT JOIN public.categories c ON ((c.id = p.category_id)))
     LEFT JOIN public.suppliers s ON ((s.id = p.supplier_id)));


ALTER VIEW public.v_item_document OWNER TO postgres;

--
-- TOC entry 303 (class 1259 OID 17712)
-- Name: v_product_full; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_product_full AS
 SELECT p.id,
    p.name,
    p.description,
    p.category_id,
    p.supplier_id,
    p.status,
    p.created_at,
    p.updated_at,
    p.price,
    p.sale_percent,
    p.is_flash_sale,
    p.final_price,
    c.name AS category_name,
    s.name AS supplier_name,
    COALESCE(( SELECT json_agg(json_build_object('url', pi.url) ORDER BY COALESCE(pi."position", 0), pi.id) AS json_agg
           FROM public.product_images pi
          WHERE ((pi.product_id = p.id) AND (pi.variant_id IS NULL))), '[]'::json) AS product_images,
    COALESCE(( SELECT json_agg(json_build_object('id', pv.id, 'sku', pv.sku, 'color_name', pv.color_name, 'color_code', pv.color_code, 'sizes', pv.sizes, 'stock_qty', pv.stock_qty, 'images', ( SELECT COALESCE(json_agg(json_build_object('url', pi2.url) ORDER BY COALESCE(pi2."position", 0), pi2.id), '[]'::json) AS "coalesce"
                   FROM public.product_images pi2
                  WHERE (pi2.variant_id = pv.id))) ORDER BY pv.id) AS json_agg
           FROM public.product_variants pv
          WHERE (pv.product_id = p.id)), '[]'::json) AS variants,
    p.sequence_id
   FROM ((public.products p
     LEFT JOIN public.categories c ON ((c.id = p.category_id)))
     LEFT JOIN public.suppliers s ON ((s.id = p.supplier_id)));


ALTER VIEW public.v_product_full OWNER TO postgres;

--
-- TOC entry 301 (class 1259 OID 17459)
-- Name: vw_product_revenue_by_day; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_product_revenue_by_day AS
 SELECT (date_trunc('day'::text, o.created_at))::date AS day,
    oi.variant_id,
    oi.name_snapshot,
    (sum((oi.final_price * (oi.qty)::numeric)))::numeric(14,2) AS revenue,
    sum(oi.qty) AS qty_sold
   FROM (public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
  WHERE ((o.payment_status)::text = 'paid'::text)
  GROUP BY (date_trunc('day'::text, o.created_at)), oi.variant_id, oi.name_snapshot
  ORDER BY ((date_trunc('day'::text, o.created_at))::date) DESC, ((sum((oi.final_price * (oi.qty)::numeric)))::numeric(14,2)) DESC;


ALTER VIEW public.vw_product_revenue_by_day OWNER TO postgres;

--
-- TOC entry 305 (class 1259 OID 17813)
-- Name: vw_top_recommended_outfits; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_top_recommended_outfits AS
 SELECT (((items -> 'outfits'::text) -> 0) ->> 'name'::text) AS outfit_name,
    count(*) AS recommend_count
   FROM public.ai_recommendations
  WHERE ((created_at > (now() - '30 days'::interval)) AND (items IS NOT NULL) AND ((((items -> 'outfits'::text) -> 0) ->> 'name'::text) IS NOT NULL))
  GROUP BY (((items -> 'outfits'::text) -> 0) ->> 'name'::text)
  ORDER BY (count(*)) DESC;


ALTER VIEW public.vw_top_recommended_outfits OWNER TO postgres;

--
-- TOC entry 4952 (class 2604 OID 17464)
-- Name: favorite seq; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.favorite ALTER COLUMN seq SET DEFAULT nextval('public.favorite_seq_seq'::regclass);


--
-- TOC entry 4995 (class 2604 OID 17465)
-- Name: products sequence_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN sequence_id SET DEFAULT nextval('public.products_sequence_id_seq'::regclass);


--
-- TOC entry 5336 (class 0 OID 17218)
-- Dependencies: 272
-- Data for Name: ai_chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_chat_messages (id, session_id, role, content, created_at) FROM stdin;
fa8c6174-be02-465e-8bbe-d792a2412b3e	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	Chào Dương! Mình là Luna đây 😊 Bạn muốn mình gợi ý outfit cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?	2025-11-24 22:56:01.47856+07
5012028a-340b-4177-ba6a-5b3c938213cf	058a4cf7-763b-4f31-a264-ed33e9da46f3	user	sắp tới mình có 1 buổi hẹn hò, nên mình đang cần outfit mới	2025-11-24 22:56:38.095153+07
9e623d60-6ce1-47c8-9ced-6ae602c76236	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	{"outfits":[{"name":"Hẹn hò phong cách - Áo hoodie + Quần ống rộng","description":"Áo hoodie màu kem kết hợp với quần ống rộng màu đen tạo nên một outfit trẻ trung và thoải mái. Chất liệu mềm mại, phù hợp cho buổi hẹn hò trong thời tiết mát mẻ. Bạn có thể thêm một chiếc túi xách nhỏ màu đen để hoàn thiện vẻ ngoài. Bạn muốn mình chọn size phù hợp không?","items":["402d387e-d08a-4e39-a84b-4472ad66fc74","f5eff02a-7be4-4164-a2a6-1449cdf4fa8b"],"why":"Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối."}]} Gợi ý size: Áo Hoodie Morning Star Bunny → L; Quần Nỉ Ống Cong Phối Dây Thừng → L Bạn có muốn xem thêm 1 outfit khác không?	2025-11-24 22:56:46.425425+07
aa095984-35c3-4868-a75a-86dcd3e63256	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	{"outfits":[{"name":"Hẹn hò phong cách - Áo hoodie + Quần ống rộng","description":"Áo hoodie màu kem kết hợp với quần ống rộng màu đen tạo nên một outfit trẻ trung và thoải mái. Chất liệu mềm mại, phù hợp cho buổi hẹn hò trong thời tiết mát mẻ. Bạn có thể thêm một chiếc túi xách nhỏ màu đen để hoàn thiện vẻ ngoài. Bạn muốn mình chọn size phù hợp không?","items":["402d387e-d08a-4e39-a84b-4472ad66fc74","f5eff02a-7be4-4164-a2a6-1449cdf4fa8b"],"why":"Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối."}]} Gợi ý size: Áo Hoodie Morning Star Bunny → L; Quần Nỉ Ống Cong Phối Dây Thừng → L Bạn có muốn xem thêm 1 outfit khác không?	2025-11-24 22:56:46.436595+07
dd3c3974-546d-4788-b109-1d1f3c9c642c	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	{"outfits":[{"name":"Hẹn hò phong cách - Áo thun đen kẻ trắng + Quần kaki xanh rêu","description":"Áo thun dài tay màu đen kẻ trắng kết hợp với quần kaki ống rộng màu xanh rêu tạo nên một outfit trẻ trung và thoải mái. Chất liệu mềm mại, rất phù hợp cho buổi hẹn hò trong thời tiết mát mẻ. Bạn có thể thêm một chiếc túi xách nhỏ màu đen để hoàn thiện vẻ ngoài. Bạn muốn mình chọn size phù hợp không?","items":["5de98951-3639-42b2-a9f4-c06eec6c30a1","b506fbd2-88ac-4ffb-a983-2973466c3a9f"],"why":"Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối."}]} Gợi ý size: Áo Thun Sweater Dài Tay Form Rộng Unisex → L; Quần Vải Kaki Dù Xếp Ly Ống Rộng → L Bạn có muốn xem thêm 1 outfit khác không?	2025-11-24 23:06:38.994911+07
5882b4e2-8ad1-4768-9ef5-148016ca7d8d	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?	2025-11-24 23:16:50.555485+07
44bd0580-9885-421d-8b4d-4fbcc7d5109d	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?	2025-11-24 23:17:48.091592+07
2a0c76a8-903d-42a0-8e9a-548aec7b33a7	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?	2025-11-24 23:18:39.511481+07
c9dbc564-467b-45d8-8c39-52ebbcc301f3	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	{"outfits":[{"name":"Hẹn hò phong cách - Áo thun đen + Quần ống rộng kem","description":"Áo thun đen đơn giản kết hợp với quần ống rộng màu kem tạo nên một outfit thanh lịch và thoải mái. Chất liệu nhẹ nhàng, rất phù hợp cho buổi hẹn hò trong thời tiết mát mẻ. Bạn có thể thêm một chiếc túi xách nhỏ màu be để hoàn thiện vẻ ngoài. Bạn muốn mình chọn size phù hợp không?","items":["7d751d4d-b43d-43bb-b29c-c9a55316a922","4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5"],"why":"Outfit này vừa trẻ trung vừa thoải mái, rất phù hợp cho buổi hẹn hò vào buổi tối."}]} Gợi ý size: Áo Thun Trơn Phối Vạt Trước → L; Quần Vải Kaki Dù Xếp Ly Ống Rộng → L Bạn có muốn xem thêm 1 outfit khác không?	2025-11-24 23:20:58.497338+07
c51d86aa-3ec9-4457-adeb-9968ca322ffa	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?	2025-11-24 23:22:19.053773+07
bfe30146-6f18-4762-a031-ad3513a1b900	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	{"outfits":[{"name":"Hẹn hò phong cách - Quần Kaki Dù Xếp Ly + Áo Sơ Mi Kẻ Sọc","description":"Quần vải kaki dù xếp ly ống rộng màu kem kết hợp với áo sơ mi tay dài kẻ sọc tạo nên một outfit thanh lịch và trẻ trung. Chất liệu thoáng mát, rất phù hợp cho buổi hẹn hò trong thời tiết mát mẻ, dễ chịu. Bạn có thể thêm một chiếc túi xách nhỏ màu đen để hoàn thiện vẻ ngoài. Bạn muốn mình chọn size phù hợp không?","items":["4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5","b5b5d60a-9f3a-455c-b056-a9fd67546bc4"],"why":"Outfit này vừa thoải mái vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối."}]} Gợi ý size: Quần Vải Kaki Dù Xếp Ly Ống Rộng → L Bạn có muốn xem thêm 1 outfit khác không?	2025-11-24 23:39:44.046026+07
d0d1d39d-446b-4132-b6fd-a1417562dbf8	058a4cf7-763b-4f31-a264-ed33e9da46f3	assistant	{"outfits":[{"name":"Hẹn hò nữ tính - Quần kaki xếp ly + Áo thun","description":"Quần vải kaki xếp ly ống rộng màu kem kết hợp với áo thun màu be tạo nên một outfit thanh lịch và thoải mái. Chất liệu nhẹ nhàng, rất phù hợp cho buổi hẹn hò trong thời tiết mát mẻ, dễ chịu. Bạn có thể thêm một chiếc túi xách nhỏ màu kem để hoàn thiện vẻ ngoài. Bạn muốn mình chọn size phù hợp không?","items":["4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5","5d02b776-a946-490d-bf0d-ed21c6c7ec1a"],"why":"Outfit này vừa thoải mái vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối."}]} Gợi ý size: Áo Thun Teelab Sporty Side-Line → L; Quần Vải Kaki Dù Xếp Ly Ống Rộng → L Bạn có muốn xem thêm 1 outfit khác không?	2025-11-24 23:58:08.22852+07
\.


--
-- TOC entry 5337 (class 0 OID 17226)
-- Dependencies: 273
-- Data for Name: ai_chat_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_chat_sessions (id, user_id, started_at, last_message_at, context) FROM stdin;
058a4cf7-763b-4f31-a264-ed33e9da46f3	eba218de-6fdf-44bb-b443-8d8e7e707afc	2025-11-24 22:56:01.47856+07	2025-11-25 00:24:05.880818+07	{}
\.


--
-- TOC entry 5338 (class 0 OID 17235)
-- Dependencies: 274
-- Data for Name: ai_recommendations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_recommendations (id, user_id, context, items, model_version, created_at) FROM stdin;
9683f4ad-29ec-4e2e-a702-9083e51c1d52	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "402d387e-d08a-4e39-a84b-4472ad66fc74", "category_id": "c53c187a-2559-48aa-96a2-d1430eba1597", "product_name": "Áo Hoodie Morning Star Bunny"}, {"variant_id": "f5eff02a-7be4-4164-a2a6-1449cdf4fa8b", "category_id": "b1017d62-8275-41c0-b79b-3d8659ada027", "product_name": "Quần Nỉ Ống Cong Phối Dây Thừng"}], "name": "Hẹn hò phong cách - Áo hoodie + Quần ống rộng", "items": ["402d387e-d08a-4e39-a84b-4472ad66fc74", "f5eff02a-7be4-4164-a2a6-1449cdf4fa8b"]}]}	gpt-4o-mini	2025-11-24 22:56:46.425425+07
b07e02dc-64e7-46df-92d5-44a45783ce5e	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "5de98951-3639-42b2-a9f4-c06eec6c30a1", "category_id": "f5b5d60a-9f3a-455c-b056-a9fd67546bc4", "product_name": "Áo Thun Sweater Dài Tay Form Rộng Unisex"}, {"variant_id": "b506fbd2-88ac-4ffb-a983-2973466c3a9f", "category_id": "b1017d62-8275-41c0-b79b-3d8659ada027", "product_name": "Quần Vải Kaki Dù Xếp Ly Ống Rộng"}], "name": "Hẹn hò phong cách - Áo thun đen kẻ trắng + Quần kaki xanh rêu", "items": ["5de98951-3639-42b2-a9f4-c06eec6c30a1", "b506fbd2-88ac-4ffb-a983-2973466c3a9f"]}]}	gpt-4o-mini	2025-11-24 23:06:38.994911+07
7a2ffe69-5d13-42f2-8376-8f06cfc5292f	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa trẻ trung vừa thoải mái, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "7d751d4d-b43d-43bb-b29c-c9a55316a922", "category_id": "f5b5d60a-9f3a-455c-b056-a9fd67546bc4", "product_name": "Áo Thun Trơn Phối Vạt Trước"}, {"variant_id": "4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5", "category_id": "b1017d62-8275-41c0-b79b-3d8659ada027", "product_name": "Quần Vải Kaki Dù Xếp Ly Ống Rộng"}], "name": "Hẹn hò phong cách - Áo thun đen + Quần ống rộng kem", "items": ["7d751d4d-b43d-43bb-b29c-c9a55316a922", "4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5"]}]}	gpt-4o-mini	2025-11-24 23:20:58.497338+07
dee8f565-c82f-40b5-a179-44b016b7fbc0	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "b5bb2533-fbe6-4bcf-b67c-03c4a76e8e7b", "category_id": "61fd3769-9276-4155-a6e7-3af4343ba5e0", "product_name": "Áo Sơ Mi Tay Dài Kẻ Sọc"}, {"variant_id": "4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5", "category_id": "b1017d62-8275-41c0-b79b-3d8659ada027", "product_name": "Quần Vải Kaki Dù Xếp Ly Ống Rộng"}], "name": "Hẹn hò phong cách - Áo len ôm đỏ + Quần kaki xếp ly kem", "items": ["b5bb2533-fbe6-4bcf-b67c-03c4a76e8e7b", "4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5"]}]}	gpt-4o-mini	2025-11-24 23:47:01.903975+07
56fd61e8-8e5f-4c33-9017-76fc1991b2fe	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa thoải mái vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "5d02b776-a946-490d-bf0d-ed21c6c7ec1a", "category_id": "f5b5d60a-9f3a-455c-b056-a9fd67546bc4", "product_name": "Áo Thun Teelab Sporty Side-Line"}, {"variant_id": "4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5", "category_id": "b1017d62-8275-41c0-b79b-3d8659ada027", "product_name": "Quần Vải Kaki Dù Xếp Ly Ống Rộng"}], "name": "Hẹn hò nữ tính - Quần kaki xếp ly + Áo thun", "items": ["5d02b776-a946-490d-bf0d-ed21c6c7ec1a", "4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5"]}]}	gpt-4o-mini	2025-11-24 23:58:08.22852+07
4b9f3558-e241-4301-b073-bae39c49e268	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "9a26596c-fe14-4a9c-8bf2-5a3fa00ba4fa", "category_id": "61fd3769-9276-4155-a6e7-3af4343ba5e0", "product_name": "Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize"}], "name": "Hẹn hò phong cách - Áo len đỏ + Chân váy đen xòe", "items": ["9a26596c-fe14-4a9c-8bf2-5a3fa00ba4fa"]}]}	gpt-4o-mini	2025-11-24 23:59:59.528728+07
729dc3e7-84ec-429a-a964-ebfbe70ee78d	eba218de-6fdf-44bb-b443-8d8e7e707afc	{"weather": "mát mẻ, dễ chịu", "occasion": "hẹn hò"}	{"outfits": [{"why": "Outfit này vừa ấm áp vừa thời trang, rất phù hợp cho buổi hẹn hò vào buổi tối.", "meta": [{"variant_id": "3607e94f-eed3-4a13-9d86-0d77ce469e94", "category_id": "bbe41a47-8a08-43e4-9a5d-b599237fcd81", "product_name": "Quần Shorts Nam New French Terry V2"}], "name": "Hẹn hò phong cách - Áo len đỏ + Chân váy xòe đen", "items": ["3607e94f-eed3-4a13-9d86-0d77ce469e94"]}]}	gpt-4o-mini	2025-11-25 00:24:05.880818+07
\.


--
-- TOC entry 5339 (class 0 OID 17242)
-- Dependencies: 275
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cart_items (id, cart_id, variant_id, qty, price_snapshot, created_at, updated_at, size_snapshot) FROM stdin;
88ec6bab-8d1a-43ed-ba34-1d1e7ae3d922	b74ef8e0-be40-4887-bf21-1a794bacd0e2	6773469f-5821-4a4b-b640-efd57f2ca2bf	1	149000.00	2025-11-25 10:25:00.087305	2025-11-25 10:25:00.087305	M
8e70f42d-e664-46de-bd35-be4fd397a380	b74ef8e0-be40-4887-bf21-1a794bacd0e2	6cad0572-df54-4195-8389-a6d2da0dd317	1	225000.00	2025-11-25 10:25:48.42183	2025-11-25 10:25:48.42183	L
\.


--
-- TOC entry 5340 (class 0 OID 17248)
-- Dependencies: 276
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.carts (id, user_id, updated_at) FROM stdin;
b74ef8e0-be40-4887-bf21-1a794bacd0e2	40685da8-f6f5-48e9-82d5-ef79ab165c6d	2025-11-25 10:25:48.42183
648a56e3-0ee2-41d9-af4b-1c711457eb45	eba218de-6fdf-44bb-b443-8d8e7e707afc	2025-11-25 16:16:23.115231
\.


--
-- TOC entry 5341 (class 0 OID 17253)
-- Dependencies: 277
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, parent_id, created_at, updated_at, image) FROM stdin;
c35916a1-387f-4ae8-85c9-0ca9eef95995	Túi xách nữ	\N	2025-11-21 14:53:56.166099	2025-11-21 14:53:56.166099	\N
d9d08d20-b12f-4abe-8147-5810e758e7ac	Túi đeo chéo	c35916a1-387f-4ae8-85c9-0ca9eef95995	2025-11-21 14:54:06.484982	2025-11-21 14:54:06.484982	\N
dd23c2e7-3bd6-49c8-bb67-7033e8fc2138	Áo	\N	2025-11-21 20:12:43.095393	2025-11-21 20:12:43.095393	\N
61fd3769-9276-4155-a6e7-3af4343ba5e0	Áo sơ mi	dd23c2e7-3bd6-49c8-bb67-7033e8fc2138	2025-11-21 20:13:05.688707	2025-11-21 20:13:05.688707	\N
f5b5d60a-9f3a-455c-b056-a9fd67546bc4	Áo thun	dd23c2e7-3bd6-49c8-bb67-7033e8fc2138	2025-11-21 20:13:34.314146	2025-11-21 20:13:34.314146	\N
9e7e8f76-e2c1-4c8f-a34a-3c94b3dd1d72	Quần	\N	2025-11-21 20:13:40.526265	2025-11-21 20:13:40.526265	\N
bfad29e9-032c-4498-b70c-eaac37162870	Quần Jean	9e7e8f76-e2c1-4c8f-a34a-3c94b3dd1d72	2025-11-21 20:14:00.794208	2025-11-21 20:14:00.794208	\N
b1017d62-8275-41c0-b79b-3d8659ada027	Quần ống rộng	9e7e8f76-e2c1-4c8f-a34a-3c94b3dd1d72	2025-11-21 20:14:28.297583	2025-11-21 20:14:28.297583	\N
6c6d9548-4b93-4534-a70b-b28d98f00ce8	Túi xách	c35916a1-387f-4ae8-85c9-0ca9eef95995	2025-11-21 22:07:49.690689	2025-11-21 22:07:49.690689	\N
90527a4b-4c56-431d-bcf2-5909223e41d8	Set quà tặng	c35916a1-387f-4ae8-85c9-0ca9eef95995	2025-11-21 22:24:43.316046	2025-11-21 22:24:43.316046	\N
df7d5669-6822-483e-9649-c5c386b8b646	Phụ kiện	\N	2025-11-22 00:30:21.59717	2025-11-22 00:30:21.59717	\N
5ca01ef3-1557-44b2-96b7-e99fc6a489ea	Ví Nam	df7d5669-6822-483e-9649-c5c386b8b646	2025-11-22 00:30:32.691493	2025-11-22 00:30:32.691493	\N
bf82bdf3-6ee2-438f-bd28-469c96dffb8e	Ví nữ	df7d5669-6822-483e-9649-c5c386b8b646	2025-11-22 00:30:42.945303	2025-11-22 00:30:42.945303	\N
51c1be16-52ef-4b63-9ace-a8d647faa918	Kính mắt	df7d5669-6822-483e-9649-c5c386b8b646	2025-11-22 00:30:51.6178	2025-11-22 00:30:51.6178	\N
c132016c-ccde-4751-8c7e-c1981f0254a7	Kính bảo hộ	df7d5669-6822-483e-9649-c5c386b8b646	2025-11-22 00:34:43.397563	2025-11-22 00:34:43.397563	\N
a89d3fa5-bd35-44e8-aec0-ac7a119d171d	Kính mát	df7d5669-6822-483e-9649-c5c386b8b646	2025-11-22 00:34:59.637818	2025-11-22 00:34:59.637818	\N
2254c194-747e-4639-adcd-698b5005a0ff	Gọng kính	df7d5669-6822-483e-9649-c5c386b8b646	2025-11-22 00:37:14.946383	2025-11-22 00:37:14.946383	\N
c53c187a-2559-48aa-96a2-d1430eba1597	Áo Hoodie - Sweater	dd23c2e7-3bd6-49c8-bb67-7033e8fc2138	2025-11-21 20:12:55.757475	2025-11-22 02:09:18.380876	\N
153ed4d5-a042-4f74-81c9-1cb17aa76861	Quần Âu - Ống suông	9e7e8f76-e2c1-4c8f-a34a-3c94b3dd1d72	2025-11-21 20:14:15.715562	2025-11-22 02:23:35.768372	\N
0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	Áo Varsity - Bomber	dd23c2e7-3bd6-49c8-bb67-7033e8fc2138	2025-11-22 23:24:05.770408	2025-11-22 23:24:05.770408	\N
bbe41a47-8a08-43e4-9a5d-b599237fcd81	Quần short	9e7e8f76-e2c1-4c8f-a34a-3c94b3dd1d72	2025-11-22 23:26:35.377626	2025-11-22 23:26:35.377626	\N
\.


--
-- TOC entry 5342 (class 0 OID 17261)
-- Dependencies: 278
-- Data for Name: favorite; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.favorite (id, user_id, product_id, created_at, seq) FROM stdin;
\.


--
-- TOC entry 5347 (class 0 OID 17305)
-- Dependencies: 284
-- Data for Name: news; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.news (id, title, content, image, created_at, updated_at, content_blocks) FROM stdin;
\.


--
-- TOC entry 5348 (class 0 OID 17314)
-- Dependencies: 285
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, variant_id, qty, unit_price, name_snapshot, color_snapshot, size_snapshot, final_price, promo_applied, line_base, discount_amount) FROM stdin;
f7dcae88-48e7-4771-84b3-ca0eca0af3a8	68cbc4bc-a583-49d7-ba57-7f49cf992f1a	69044697-f24a-4e02-9d61-777681f6e610	1	129000.00	Áo sơ mi nam form rộng cổ chữ V dài tay	\N	L	129000.00	f	0	0
72ec9ca7-4973-4c56-a259-13f02bfabd79	68cbc4bc-a583-49d7-ba57-7f49cf992f1a	6718d8ce-0fbe-4e62-94db-e3c70c5869fb	1	149000.00	Quần tây nam Hàn Quốc dáng baggy suông	\N	L	149000.00	f	0	0
26ef464a-6f3b-42fc-bd36-1f28b6540186	68cbc4bc-a583-49d7-ba57-7f49cf992f1a	ce8e30c1-d30e-42aa-aed3-9fed3006b4c8	1	249000.00	Ví Da REX	\N	KHÁC	249000.00	f	0	0
e6eaec79-9f01-4a91-b050-b61566621aa3	68cbc4bc-a583-49d7-ba57-7f49cf992f1a	3512b12e-82bf-41e0-8d04-f951e5ca9c88	1	275000.00	Áo Khoác Gió Nam Nữ 2 lớp Windbreaker	\N	L	275000.00	f	0	0
8a0d1e7a-f706-4eef-aa79-02fae3cefa20	68cbc4bc-a583-49d7-ba57-7f49cf992f1a	bf3fa4ec-f9d8-4fe8-92d9-d383b272b74c	1	139000.00	Áo Khoác Bomber Dù Hai Lớp	\N	M	139000.00	f	0	0
730593e0-b202-4095-a327-62eceb891f53	22fbff28-2d34-4223-9f08-39baf5d3d416	6773469f-5821-4a4b-b640-efd57f2ca2bf	1	149000.00	Quần tây nam Hàn Quốc dáng baggy suông	\N	L	149000.00	f	0	0
002fdcde-5a2a-4a41-a924-d9bba2cb63c8	22fbff28-2d34-4223-9f08-39baf5d3d416	6cad0572-df54-4195-8389-a6d2da0dd317	1	225000.00	Áo Polo Sweater Nỉ Chân Cua Basic	\N	L	225000.00	f	0	0
739c8fe8-56b2-4e8f-917e-73eb158ee98e	22fbff28-2d34-4223-9f08-39baf5d3d416	3512b12e-82bf-41e0-8d04-f951e5ca9c88	1	275000.00	Áo Khoác Gió Nam Nữ 2 lớp Windbreaker	\N	L	275000.00	f	0	0
fe3dbd6b-3870-4c2f-ba23-b6af4c33d81c	9936dfef-d22f-4547-ab81-b5412a14ebf8	3512b12e-82bf-41e0-8d04-f951e5ca9c88	2	275000.00	Áo Khoác Gió Nam Nữ 2 lớp Windbreaker	\N	L	550000.00	f	550000	0
a008fd13-84ed-48f7-97f0-1222a94dd7c5	228d2612-9ec1-4f07-b698-98f302939ccf	1fb0034e-4907-4678-b13d-1b4da10f8748	1	198999.00	Áo Hoodie Zip Form Rộng	\N	L	198999.00	f	198999	0
2575434a-1fe8-4217-86ab-a4fb284c371a	228d2612-9ec1-4f07-b698-98f302939ccf	b3c45334-3752-42f1-adad-4a2e4f78028d	2	198999.00	Áo Hoodie Zip Form Rộng	\N	L	397998.00	f	397998	0
e305d9ac-53e8-4633-93b9-5f929097fda1	c5aebd10-6e91-4445-b160-378c49411033	9817634d-ad5f-4fc3-b31b-d1c46565a7c2	2	299000.00	Áo hoodie ninja cao cổ Ver 2	\N	L	598000.00	f	598000	0
da6c69a9-7422-411c-93a5-e575fffc913c	b35cbfcd-9d97-4369-bd57-6f9917c4c030	9a26596c-fe14-4a9c-8bf2-5a3fa00ba4fa	4	129000.00	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize	\N	XL	516000.00	f	516000	0
3943977b-fe98-47f0-99fb-0c22535bc806	edd6c9ea-9915-4df8-8c6e-9b537c2fb298	9a26596c-fe14-4a9c-8bf2-5a3fa00ba4fa	4	129000.00	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize	\N	XL	258000.00	t	0	0
\.


--
-- TOC entry 5349 (class 0 OID 17319)
-- Dependencies: 286
-- Data for Name: order_notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_notifications (id, order_id, type, sent_at, metadata) FROM stdin;
\.


--
-- TOC entry 5344 (class 0 OID 17267)
-- Dependencies: 280
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, user_id, total_amount, discount_amount, shipping_fee, payment_status, order_status, shipping_address_snapshot, payment_method, created_at, updated_at, final_amount, promotion_code, promotion_id, cancel_reason) FROM stdin;
68cbc4bc-a583-49d7-ba57-7f49cf992f1a	eba218de-6fdf-44bb-b443-8d8e7e707afc	941000.00	0.00	30000.00	unpaid	pending	{"phone": "0774546059", "address": "9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh", "full_name": "Trần Phương Dương"}	cod	2025-11-25 10:36:15.383762	2025-11-25 10:36:15.383762	971000.00	\N	\N	\N
22fbff28-2d34-4223-9f08-39baf5d3d416	eba218de-6fdf-44bb-b443-8d8e7e707afc	649000.00	0.00	30000.00	unpaid	pending	{"phone": "0774546059", "address": "9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh", "full_name": "Trần Phương Dương"}	cod	2025-11-25 10:44:00.867061	2025-11-25 10:44:00.867061	679000.00	\N	\N	\N
9936dfef-d22f-4547-ab81-b5412a14ebf8	eba218de-6fdf-44bb-b443-8d8e7e707afc	550000.00	0.00	30000.00	unpaid	pending	{"phone": "0774546059", "address": "9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh", "full_name": "Trần Phương Dương"}	cod	2025-11-25 10:47:45.60688	2025-11-25 10:47:45.60688	580000.00	\N	\N	\N
228d2612-9ec1-4f07-b698-98f302939ccf	eba218de-6fdf-44bb-b443-8d8e7e707afc	596997.00	0.00	30000.00	unpaid	pending	{"phone": "0774546059", "address": "9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh", "full_name": "Trần Phương Dương"}	cod	2025-11-25 14:06:21.795085	2025-11-25 14:06:21.795085	626997.00	\N	\N	\N
c5aebd10-6e91-4445-b160-378c49411033	eba218de-6fdf-44bb-b443-8d8e7e707afc	598000.00	0.00	30000.00	unpaid	pending	{"phone": "0774546059", "address": "9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh", "full_name": "Trần Phương Dương"}	cod	2025-11-25 14:12:55.495488	2025-11-25 14:12:55.495488	628000.00	BLACKFRIDAY	\N	\N
b35cbfcd-9d97-4369-bd57-6f9917c4c030	eba218de-6fdf-44bb-b443-8d8e7e707afc	516000.00	0.00	30000.00	unpaid	pending	{"phone": "0774546059", "address": "9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh", "full_name": "Trần Phương Dương"}	cod	2025-11-25 14:19:20.712001	2025-11-25 14:19:20.712001	546000.00	\N	\N	\N
edd6c9ea-9915-4df8-8c6e-9b537c2fb298	eba218de-6fdf-44bb-b443-8d8e7e707afc	516000.00	258000.00	30000.00	unpaid	pending	\N	cod	2025-11-25 15:56:44.259117	2025-11-25 15:56:44.259117	288000.00	\N	\N	\N
\.


--
-- TOC entry 5350 (class 0 OID 17327)
-- Dependencies: 287
-- Data for Name: otp_verifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.otp_verifications (id, email, otp, expires_at, created_at) FROM stdin;
\.


--
-- TOC entry 5345 (class 0 OID 17282)
-- Dependencies: 281
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, order_id, gateway, amount, currency, status, paid_at, created_at, updated_at, gateway_tx_id, payer_id, payer_email, metadata, raw_response) FROM stdin;
\.


--
-- TOC entry 5351 (class 0 OID 17334)
-- Dependencies: 288
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_images (id, product_id, url, created_at, variant_id, "position") FROM stdin;
7763ecf1-1778-4506-b428-d1c715f9bee0	508ad9d2-9ba1-40fe-83b7-88d6a829a6bb	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763731340/fashion_ecommerce/product/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi/vdjhfbwxl9fju0a3vm2b.webp	2025-11-21 20:22:17.536819	\N	\N
d212b3d7-e83f-4bbe-b738-2c4a0731c26c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763731341/fashion_ecommerce/product/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi/variant/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi-%C3%81o%20thun-Zonef-X%C3%A1m%20tr%E1%BA%AFng/zwkedirzb7zc8gmxvhou.webp	2025-11-21 20:22:17.536819	218141e5-6166-403c-94ba-a3b35ac7d57c	\N
dcf7f3b3-531c-4444-b9b0-d20dd4c2ebbd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763731341/fashion_ecommerce/product/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi/variant/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi-%C3%81o%20thun-Zonef-X%C3%A1m%20ti%C3%AAu/lbtaqren0feaxkoypbso.webp	2025-11-21 20:22:17.536819	5a050f58-c757-4bda-a00a-a29e5e34ca3a	\N
130d2ade-c66b-43df-91ec-0edaaecf0a65	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763731341/fashion_ecommerce/product/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi/variant/%C3%81o%20Sweater%20Nam%20Ph%E1%BB%91i%20S%C6%A1%20Mi-%C3%81o%20thun-Zonef-%C4%90en/q4xlx4czta5kpsguau4a.webp	2025-11-21 20:22:17.536819	7b43ae03-c2ee-464b-ae62-e0b0a22d6bff	\N
536fa590-1525-44d8-b5d6-c62ba3e1a2c9	ed97bb82-d6f9-4100-9d97-9fd3e5130808	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734458/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize/se0qeewopzqszq5f8nvm.webp	2025-11-21 21:14:18.816246	\N	\N
16091bf9-51b5-43ad-8ee7-86358c4853e8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734462/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize-%C3%81o%20s%C6%A1%20mi-Zonef-Tr%E1%BA%AFng/fk0rdgfkm9s6n8p1xds9.webp	2025-11-21 21:14:18.816246	03b38702-a5f0-4211-8b69-48c7c70aad2f	\N
47836d49-8bd5-4b12-b461-f704c82d57ce	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734462/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize-%C3%81o%20s%C6%A1%20mi-Zonef-xanh%20c%E1%BB%91m/bx4miwjwk4y88d76jjbg.webp	2025-11-21 21:14:18.816246	9a26596c-fe14-4a9c-8bf2-5a3fa00ba4fa	\N
0f4b3582-dc8a-45d1-9573-71e93dd46f5d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734463/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize-%C3%81o%20s%C6%A1%20mi-Zonef-Xanh%20ghi/ahpnuaxupiyxgvqyxdtx.webp	2025-11-21 21:14:18.816246	dd6c971d-fc45-4f48-b6ad-0616a95fb9a3	\N
f16dba11-3438-4eb1-9456-b23aa9ef3567	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734463/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20Ng%E1%BA%AFn%20Tay%20Ph%E1%BB%91i%20C%C3%A0%20V%E1%BA%A1t%20Oversize-%C3%81o%20s%C6%A1%20mi-Zonef-%C4%90en/hmotbwsvgyaonb414ffp.webp	2025-11-21 21:14:18.816246	534c96a5-06e0-4e08-b064-5a1d57b69e3d	\N
dfa0878c-884f-472b-b413-84c6bffcd39e	39e16012-3a4b-4991-b6e1-86ea9e27f7d1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734731/fashion_ecommerce/product/%C3%81o%20hoodie%20ninja%20cao%20c%E1%BB%95%20Ver%202/zaszendgnljuc1ddudju.webp	2025-11-21 21:18:50.394407	\N	\N
d6a006ad-5f59-46e5-9e39-bad95443f55e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734732/fashion_ecommerce/product/%C3%81o%20hoodie%20ninja%20cao%20c%E1%BB%95%20Ver%202/variant/%C3%81o%20hoodie%20ninja%20cao%20c%E1%BB%95%20Ver%202-%C3%81o%20Hoodie-Zonef-%C4%90en/hjtfhm9lauljbkbacpni.webp	2025-11-21 21:18:50.394407	9817634d-ad5f-4fc3-b31b-d1c46565a7c2	\N
9a496236-a5c3-41f3-9e79-3d2deb798fc1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763734734/fashion_ecommerce/product/%C3%81o%20hoodie%20ninja%20cao%20c%E1%BB%95%20Ver%202/variant/%C3%81o%20hoodie%20ninja%20cao%20c%E1%BB%95%20Ver%202-%C3%81o%20Hoodie-Zonef-X%C3%A1m/suovqegotwevdqyb9tki.webp	2025-11-21 21:18:50.394407	cba46ffa-2111-446b-bc1c-a6caa8791f3e	\N
59bcf073-4bb9-48a0-914b-12c52e48d47b	1ef6a49e-4a10-446f-a60a-fd2307a5423d	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735050/fashion_ecommerce/product/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc/luqjcz3nzqqyckfdavrf.webp	2025-11-21 21:24:08.319717	\N	\N
808df782-6b20-47cc-9da8-4f18e8be5d95	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735051/fashion_ecommerce/product/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc/variant/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc-%C3%81o%20thun-Zonef-%C4%90en/tjdbtevkfvjvazhy4kfw.webp	2025-11-21 21:24:08.319717	7d751d4d-b43d-43bb-b29c-c9a55316a922	\N
6fe89429-bc6c-41bd-9294-fd95fb377ec8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735052/fashion_ecommerce/product/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc/variant/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc-%C3%81o%20thun-Zonef-Tr%E1%BA%AFng/b3lmwkvd1lfct4ykg8rp.webp	2025-11-21 21:24:08.319717	a5718bd2-99d1-4228-9540-cfe2aa022dd3	\N
ae9ad690-e4d4-4657-a682-3768a8b97aef	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735052/fashion_ecommerce/product/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc/variant/%C3%81o%20Thun%20Tr%C6%A1n%20Ph%E1%BB%91i%20V%E1%BA%A1t%20Tr%C6%B0%E1%BB%9Bc-%C3%81o%20thun-Zonef-%C4%90%E1%BB%8F%20%C4%91%C3%B4/hoap9qqaqqb6427ycgvl.webp	2025-11-21 21:24:08.319717	32a86374-044a-4373-84d9-bf7354fbd6d4	\N
79110b09-8ea5-4547-b718-1343faec3de5	ca60a8d3-00d8-4125-92ca-3f5219959851	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735232/fashion_ecommerce/product/%C3%81o%20Thun%20Sweater%20D%C3%A0i%20Tay%20Form%20R%E1%BB%99ng%20Unisex/trzgf0z5anrm2dtpbnwn.webp	2025-11-21 21:27:09.13702	\N	\N
a5043fa5-82c6-4c64-a8b2-eec15f0326d8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735232/fashion_ecommerce/product/%C3%81o%20Thun%20Sweater%20D%C3%A0i%20Tay%20Form%20R%E1%BB%99ng%20Unisex/variant/%C3%81o%20Thun%20Sweater%20D%C3%A0i%20Tay%20Form%20R%E1%BB%99ng%20Unisex-%C3%81o%20thun-Zonef-Kem%20k%E1%BA%BB%20%C4%91en/ikr8od246r2hobrfyrto.webp	2025-11-21 21:27:09.13702	7a2d6aba-3721-40de-9549-4888ebac2ebe	\N
cf001317-4e17-4eb0-9b36-6b6b9577a0d6	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735232/fashion_ecommerce/product/%C3%81o%20Thun%20Sweater%20D%C3%A0i%20Tay%20Form%20R%E1%BB%99ng%20Unisex/variant/%C3%81o%20Thun%20Sweater%20D%C3%A0i%20Tay%20Form%20R%E1%BB%99ng%20Unisex-%C3%81o%20thun-Zonef-%C4%90en%20k%E1%BA%BB%20tr%E1%BA%AFng/ouuwxir731ik47s0dtjb.webp	2025-11-21 21:27:09.13702	5de98951-3639-42b2-a9f4-c06eec6c30a1	\N
9ab21a72-2034-4507-a407-6ab3e5aab971	57fc66fe-d83a-41d6-9800-5c7a1541d4ab	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735605/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng/rdftle8k1s7uudqtt4dy.webp	2025-11-21 21:33:23.841721	\N	\N
2360aee3-9d3e-4f51-87cd-0922930e744f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735606/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-X%C3%A1m%20tr%E1%BA%AFng/bxhbsh09mmqoihi4azlb.webp	2025-11-21 21:33:23.841721	a782f0d9-f0b2-4efe-ae69-2c35e44285a7	\N
b9b45a22-d1c4-4c6a-b6dc-42a0c46fd8be	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735607/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-X%C3%A1m%20ti%C3%AAu/uli5axngspawkpht7ose.webp	2025-11-21 21:33:23.841721	2b5ea2c1-5465-47b3-9398-7b256e173bd4	\N
4b810420-6637-4fe9-87eb-3f7554473db4	20f7bdde-110c-42c3-ab60-a4d4b4183129	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739338/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20%C4%90ai%20Ngang/hwvtd5u9dnwo9mn7j6nj.webp	2025-11-21 22:35:36.208679	\N	\N
22ea3fc5-e63c-4d1c-8c96-242283cf0640	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735606/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-%C4%90en/qoqppmblsl2twcxcozby.webp	2025-11-21 21:33:23.841721	94dc42de-76eb-414f-8fdb-fd515af79c06	\N
d266e01e-32c6-4231-bb2d-4206136cf735	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763735607/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20%E1%BB%90ng%20Cong%20Ph%E1%BB%91i%20D%C3%A2y%20Th%E1%BB%ABng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-N%C3%A2u/snnhaxkg9oxtmosy6koq.webp	2025-11-21 21:33:23.841721	f5eff02a-7be4-4164-a2a6-1449cdf4fa8b	\N
d8c17fa3-e8e6-43df-95bd-37ba1bfc1a74	5e8b15d6-2a08-4acd-a57a-3ccc364973c1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736093/fashion_ecommerce/product/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng/vojjo4fwbbesjwnsfvzb.webp	2025-11-21 21:41:31.818654	\N	\N
157e1f3c-ffc5-4a25-9476-83b1b1ae0593	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736094/fashion_ecommerce/product/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-%C4%90en/kvmm5vk3y6hlfow6iqur.webp	2025-11-21 21:41:31.818654	36ef4013-9718-400c-86c1-af71d27ad030	\N
7129a2e7-9c13-4738-be2f-1c51e6cbb1a3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736095/fashion_ecommerce/product/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-Xanh%20r%C3%AAu/ipzwno7mfmueuftrgtc9.webp	2025-11-21 21:41:31.818654	b506fbd2-88ac-4ffb-a983-2973466c3a9f	\N
d3c59dac-b83d-4733-a01b-9cf484842c3a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736095/fashion_ecommerce/product/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-Kem/yv0eifiukegjoeplkzvo.webp	2025-11-21 21:41:31.818654	4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5	\N
908b3939-bbd9-4c48-a187-4185ddd3313e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736096/fashion_ecommerce/product/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-N%C3%A2u/szgnzlylrfolosculjvy.webp	2025-11-21 21:41:31.818654	a62733bf-22fa-4b45-90ae-187573c47cc0	\N
f166f8dc-1f31-43dc-a346-1407f60ca0c8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736095/fashion_ecommerce/product/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20V%E1%BA%A3i%20Kaki%20D%C3%B9%20X%E1%BA%BFp%20Ly%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Zonef-Ghi/zygr30xvmfn1r59wrmq7.webp	2025-11-21 21:41:31.818654	140c718b-feff-4f67-9d64-90a2a7909958	\N
0322b974-f8f6-4c9e-a6bd-d43b37bf72f9	5d1b2d2b-a691-475e-94bb-17e92f9f2c60	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736405/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch/pgw5ayxkwzysnl654mai.webp	2025-11-21 21:46:43.490298	\N	\N
a1aada34-8edb-495a-8051-c1c1391bcc34	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736406/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch/variant/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch-Qu%E1%BA%A7n%20Jean-Zonef-%C4%90en/bx1xfplvswupeahciq13.webp	2025-11-21 21:46:43.490298	95d92259-b184-437a-b185-c534e80ac243	\N
6fb41c95-ea7e-4655-9fee-4064c519c026	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736407/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch/variant/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch-Qu%E1%BA%A7n%20Jean-Zonef-Xanh%20nh%E1%BA%A1t/b3w0h2aiy6ipayppu5y8.webp	2025-11-21 21:46:43.490298	4b677ff5-9ca5-443e-b8e2-0d3cb45cc0d1	\N
949cbf18-e82b-4dcf-a282-5fe083399563	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736407/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch/variant/Qu%E1%BA%A7n%20Jean%20Nam%20Loang%20R%C3%A1ch-Qu%E1%BA%A7n%20Jean-Zonef-Xanh%20%C4%91en/qm4rsvvflv6a8wlvue5c.webp	2025-11-21 21:46:43.490298	7f0ece59-bfea-4755-a32b-e2ba35100521	\N
d17df699-d5b6-4476-9773-0e82df8ec200	88f9f1e2-dfa6-4119-9c79-f64e04dba2d5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736641/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng/jeijfl2nvsrksjygb4yq.webp	2025-11-21 21:50:40.281175	\N	\N
6a24ce0d-ee4e-4b01-af92-f323511a7306	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736642/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20Jean-Zonef-%C4%90en/qeew4inze8nqvv36evlz.webp	2025-11-21 21:50:40.281175	db306fe0-3e06-45eb-a042-1bc537b64c42	\N
e183e9be-da4c-4005-8a47-63cfcfcb8dc3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736642/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20Jean-Zonef-Xanh/qvod5jhe0xkwfrhm2npn.webp	2025-11-21 21:50:40.281175	4352246a-0ce1-4640-ac6a-43a4c314ffb0	\N
ad7c9678-bf18-47cb-8029-9b3f1ce51ecd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736644/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A7n%20Jean%20Nam%20Su%C3%B4ng%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20Jean-Zonef-X%C3%A1m/vjkfxep9daaqtzlcntv4.webp	2025-11-21 21:50:40.281175	10a790c1-b2e2-41f7-993d-b84881d78c9e	\N
bd72e0cb-77b8-4ed9-a128-9f8180337aee	e195f30f-180a-4ca1-9cd3-aed5b35f7889	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736905/fashion_ecommerce/product/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a/lck35z55prnjwyutpt6w.webp	2025-11-21 21:55:03.188831	\N	\N
17024f22-3759-4247-bd2f-afd91873eb86	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736907/fashion_ecommerce/product/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a/variant/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a-Qu%E1%BA%A7n%20%C3%82u-Zonef-%C4%90en/vroxbld1rmuymp7mxmar.webp	2025-11-21 21:55:03.188831	f67e56e9-968d-4ee2-86a1-536cdd3aa8d5	\N
0bd9535b-d262-43b6-b98e-98e7a1e8a0b6	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736906/fashion_ecommerce/product/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a/variant/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a-Qu%E1%BA%A7n%20%C3%82u-Zonef-Ghi/iqhwvf3dlncyte1t6lv1.webp	2025-11-21 21:55:03.188831	0c01bf7a-8413-418a-8bf3-c6775c6a3d6e	\N
ccbd0e45-b7da-4011-a674-b6c875c7d91d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736906/fashion_ecommerce/product/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a/variant/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a-Qu%E1%BA%A7n%20%C3%82u-Zonef-Kem/kremh8hd0w1wwry4ydbc.webp	2025-11-21 21:55:03.188831	44bf075a-7455-4acd-bfc1-a1894caba220	\N
b0b31486-839e-49e8-ad68-fe11c9184b05	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763736907/fashion_ecommerce/product/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a/variant/Qu%E1%BA%A7n%20%E1%BB%90ng%20R%E1%BB%99ng%20C%E1%BA%A1p%20Chun%20Nam%20v%E1%BA%A3i%20Tuy%E1%BA%BFt%20M%C6%B0a-Qu%E1%BA%A7n%20%C3%82u-Zonef-N%C3%A2u/e5y61eu0kz4pznjj5tff.webp	2025-11-21 21:55:03.188831	fecdf009-7a7a-464c-8035-f0a040e8c17a	\N
a6177d65-1632-43f3-b764-5d1c0090a885	b486bb46-094f-4e92-9543-fb12aaa640fc	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737314/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS/iougp1lrl6mbwijqml8a.webp	2025-11-21 22:01:51.62576	\N	\N
be607a50-f094-46ea-bb1d-93e9d753931a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737315/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS/variant/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Hapas-X%C3%A1m%20xanh/zz6myxj0ige6z1yymiow.webp	2025-11-21 22:01:51.62576	25d47ced-db5b-4bd5-97a9-7e8f893818b9	\N
ecdb5c0b-6bb6-4fe6-a2cc-ea234ec7cc6c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737315/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS/variant/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Hapas-%C4%90en/yswariuuww7qtbboxgxm.webp	2025-11-21 22:01:51.62576	8f0c31f4-4c3c-4403-ba19-1b78d0d9cead	\N
06842e58-8e35-4f66-9ec1-9ad7be0f0acd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737316/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS/variant/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Hapas-Kem/cszqqywcbwhabqpydlpb.webp	2025-11-21 22:01:51.62576	b434644d-8f2c-433d-8271-eee1ec576ada	\N
03a2e225-1959-4f59-aaee-8b599d353b8c	b93e9113-141c-46fd-b95e-36bf16e69391	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737876/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng/yfyo1yepscxkadokcuvx.webp	2025-11-21 22:11:14.051333	\N	\N
f9396d13-34a2-4558-9844-5cc3b4bfaafd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737877/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng/variant/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng-T%C3%BAi%20x%C3%A1ch-Hapas-Jean/ibmckl5xbu0wu7ucaeu4.webp	2025-11-21 22:11:14.051333	1e32c8a7-572b-4de2-b865-823f80ae4353	\N
7aaea08e-9f02-4693-b4f6-1d228eb8b0f0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737878/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng/variant/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng-T%C3%BAi%20x%C3%A1ch-Hapas-Kem/s3wgphww1ihbiyhsu5ph.webp	2025-11-21 22:11:14.051333	866006fe-d155-40a0-82b5-4a801e349dd8	\N
463e3563-d788-4f6e-85a6-630e8b7d122a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737878/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng/variant/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20Hobo%20%C4%90%C3%A1y%20Vu%C3%B4ng-T%C3%BAi%20x%C3%A1ch-Hapas-%C4%90en/halhgaxtw1s2ajjjmmnh.webp	2025-11-21 22:11:14.051333	f0e2f3ee-ec9e-4c00-a5c6-9ccbd4ce2468	\N
605ac53e-3493-409b-946d-d7d1a37b687a	882f88a5-9a17-4218-a4d8-ade7667c088a	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738192/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp/fswthhpdmxdxr3dxd22t.webp	2025-11-21 22:16:29.907234	\N	\N
89149809-50ff-4e61-bea6-18317cdcd0eb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738192/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp/variant/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Hapas-Kem/ls3c6vs7ltmb8rsyo9pp.webp	2025-11-21 22:16:29.907234	682c0866-ad3d-4d12-9a6b-96e2fc89b037	\N
d3cad1ce-b338-4068-bf5c-e2d5e001351a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738194/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp/variant/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Hapas-%C4%90en/a8ils0evauk9xfnhwaxu.webp	2025-11-21 22:16:29.907234	d959df69-4c54-4a9b-b7ae-61def14a5faf	\N
e94cab8b-ccc5-4a2a-b66b-7ece26c784a4	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738193/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp/variant/T%C3%BAi%20%C4%90eo%20Vai%20Hobo%20N%E1%BA%AFp%20G%E1%BA%ADp-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Hapas-B%E1%BA%A1c/j6czm6ahspocoivjskho.webp	2025-11-21 22:16:29.907234	58837136-3d17-4961-9f8e-43e8ac517ad8	\N
af0418a2-5f21-47a8-8a68-fc81982ed0ac	0da4fd99-5be0-4172-8a21-7d3bd9e9c28f	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738444/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20C%C3%B4ng%20S%E1%BB%9F%20Cao%20C%E1%BA%A5p/ephgm5oomtacxfaa8g7q.webp	2025-11-21 22:20:40.996372	\N	\N
9adaac19-a206-4741-82a3-9767db65493c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738445/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20C%C3%B4ng%20S%E1%BB%9F%20Cao%20C%E1%BA%A5p/variant/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20C%C3%B4ng%20S%E1%BB%9F%20Cao%20C%E1%BA%A5p-T%C3%BAi%20x%C3%A1ch-Hapas-%C4%90en/l0rcoqsjf95qelg9o3a3.webp	2025-11-21 22:20:40.996372	b65d96ff-174b-4533-bc76-048447543fa0	\N
f169f589-550c-4883-818a-c36a2a08c8d2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738445/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20C%C3%B4ng%20S%E1%BB%9F%20Cao%20C%E1%BA%A5p/variant/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20C%C3%B4ng%20S%E1%BB%9F%20Cao%20C%E1%BA%A5p-T%C3%BAi%20x%C3%A1ch-Hapas-Tr%E1%BA%AFng/pwhvchuawoten9wsdvxt.webp	2025-11-21 22:20:40.996372	1508868b-fe97-46ea-a924-cc855367d645	\N
716f435e-296a-4244-9484-a7c0a039a7a3	c271b54d-5da5-4738-9ffa-1d20995feee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738839/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy/zl272ve1v4unavl8jilv.webp	2025-11-21 22:27:17.141331	\N	\N
94b7cd6a-03b2-420a-8113-c0a424b00948	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738840/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy/variant/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy-Set%20qu%C3%A0%20t%E1%BA%B7ng-Hapas-Kem/tjbtzki6zzvvbtzh72fs.webp	2025-11-21 22:27:17.141331	32c4b074-7c87-4eba-ae3a-f5d51211ab81	\N
7e2a2ebb-fd32-4af6-bd71-e04501c07941	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738840/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy/variant/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy-Set%20qu%C3%A0%20t%E1%BA%B7ng-Hapas-Xanh%20ghi/mwmc1pycvqtzfbkydpcd.webp	2025-11-21 22:27:17.141331	f4ad4811-12c1-4d6b-96e1-f60be655664f	\N
ba02a592-a223-4864-960b-00f236039f88	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738841/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy/variant/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy-Set%20qu%C3%A0%20t%E1%BA%B7ng-Hapas-%C4%90en/gagoyprrdow4zg9gmjdj.webp	2025-11-21 22:27:17.141331	2c09e2de-0082-4dd6-b119-0a9bf1698a74	\N
a0496143-8c72-462f-bbf8-60207b466c77	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763738841/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy/variant/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20Tidy-Set%20qu%C3%A0%20t%E1%BA%B7ng-Hapas-N%C3%A2u/dtbsty9qi3c0otqmunkh.webp	2025-11-21 22:27:17.141331	73de87c5-571e-4123-8e21-878035a3e88a	\N
6a2c476d-5d35-447d-8e7c-cdde115971f5	7885e516-1b25-4f4f-a446-c079b57f7841	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739107/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20T%C3%BAi%20X%C3%A1ch%20%22Y%C3%AAu%20Chi%E1%BB%81u%22/tqwnaldy9ssutlnmlm8q.webp	2025-11-21 22:31:45.50833	\N	\N
56659243-bba3-4260-ab20-1581b5e1f750	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739109/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20T%C3%BAi%20X%C3%A1ch%20%22Y%C3%AAu%20Chi%E1%BB%81u%22/variant/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20T%C3%BAi%20X%C3%A1ch%20%22Y%C3%AAu%20Chi%E1%BB%81u%22-Set%20qu%C3%A0%20t%E1%BA%B7ng-Hapas-Kem%20sang%20tr%E1%BB%8Dng/iquutvbweq4v3uucj1x7.webp	2025-11-21 22:31:45.50833	b6b63c6b-887b-422e-bdec-c94b88d529c6	\N
acf73577-5b7b-45c4-8f59-05d3393941f2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739110/fashion_ecommerce/product/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20T%C3%BAi%20X%C3%A1ch%20%22Y%C3%AAu%20Chi%E1%BB%81u%22/variant/B%E1%BB%99%20Qu%C3%A0%20T%E1%BA%B7ng%20T%C3%BAi%20X%C3%A1ch%20%22Y%C3%AAu%20Chi%E1%BB%81u%22-Set%20qu%C3%A0%20t%E1%BA%B7ng-Hapas-%C4%90en%20qu%C3%BD%20ph%C3%A1i/u9cm9xq7dspbfy4vvwza.webp	2025-11-21 22:31:45.50833	87da7661-15cf-43e0-9e6a-cbc3d8ccee88	\N
d8c7c290-4279-46df-be0f-0c1372e3cf97	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739340/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20%C4%90ai%20Ngang/variant/T%C3%BAi%20X%C3%A1ch%20N%E1%BB%AF%20%C4%90ai%20Ngang-T%C3%BAi%20x%C3%A1ch-Hapas-X%C3%A1m%20xanh/mf6yk24y99hirudwp59y.webp	2025-11-21 22:35:36.208679	a1517756-32b8-4050-888f-8fcace8b46d4	\N
287cce5c-1e99-4c6b-954c-b65e9eae051f	cb28b0fe-77be-4b55-b590-8100f3d0ff66	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739484/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20Hobo%20D%E1%BA%ADp%20N%E1%BB%95i%20Line%20Embossed%20Jeans/ryzamnheovman1va5w1i.webp	2025-11-21 22:38:01.505441	\N	\N
9d89f53a-157a-4dd8-8ccc-ee947d6cfe9b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739485/fashion_ecommerce/product/T%C3%BAi%20X%C3%A1ch%20Hobo%20D%E1%BA%ADp%20N%E1%BB%95i%20Line%20Embossed%20Jeans/variant/T%C3%BAi%20X%C3%A1ch%20Hobo%20D%E1%BA%ADp%20N%E1%BB%95i%20Line%20Embossed%20Jeans-T%C3%BAi%20x%C3%A1ch-Hapas-Jean/uihhhmdyjnfqx0flehzk.webp	2025-11-21 22:38:01.505441	3e6ba0f0-158c-4972-adca-fc16dc293b2e	\N
6b5cae9e-76cb-4ec4-9527-08881b32bc06	66db372f-ef45-457b-b706-4300043987e7	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739611/fashion_ecommerce/product/T%C3%BAi%20Gi%E1%BA%A5y%20%C4%90%E1%BB%B1ng%20Qu%C3%A0%20T%E1%BA%B7ng%20Cao%20C%E1%BA%A5p/qs3hpvrnso02kgjvodtm.webp	2025-11-21 22:40:08.204808	\N	\N
b7a2ef70-8f7a-42d8-b5df-dc3c9222336c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763739612/fashion_ecommerce/product/T%C3%BAi%20Gi%E1%BA%A5y%20%C4%90%E1%BB%B1ng%20Qu%C3%A0%20T%E1%BA%B7ng%20Cao%20C%E1%BA%A5p/variant/T%C3%BAi%20Gi%E1%BA%A5y%20%C4%90%E1%BB%B1ng%20Qu%C3%A0%20T%E1%BA%B7ng%20Cao%20C%E1%BA%A5p-T%C3%BAi%20x%C3%A1ch-Hapas-N%C3%A2u/z9kxtjwvqwnvfljiuhkc.webp	2025-11-21 22:40:08.204808	c17c4013-b278-4343-99f4-09b3beb1ca10	\N
437ab69b-e0db-429e-8568-14a62c484602	a55a54c4-52b1-410e-b9ec-f7afbcee916f	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746851/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/gorysvevniqbcf6cohht.webp	2025-11-22 00:40:49.484457	\N	\N
89f21087-3c1b-472a-9909-1f86e58c3866	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746852/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-Jean/ldsorcnqgbfek5gf79ew.webp	2025-11-22 00:40:49.484457	86d18b89-35a7-4c47-be81-bf0b732de663	\N
075d4598-77f5-4ead-a5aa-74a896780ef8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746852/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-V%C3%A0ng/o5ucdyr41uqwgylfyjmb.webp	2025-11-22 00:40:49.484457	7ae4d39f-732e-401a-8f13-17ab26fd6c4b	\N
8355d59d-3587-4279-ac69-39e416e36787	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746853/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-B%E1%BA%A1c/a1wddlxqlmexndmrlovc.webp	2025-11-22 00:40:49.484457	c62f081a-6f85-431e-b0d5-a2cf29932cad	\N
c00a9138-d753-41c0-83e0-60a9021e7d93	0a51eacc-eba4-41cf-8ec2-8f50fbaec231	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747036/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/eo9ylidaxqagfzhe2wqg.webp	2025-11-22 00:43:53.292088	\N	\N
be5d6593-7107-4e56-9688-3aa7cc6a117f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747036/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Lesac-%C4%90en/skam8aji9erzpohmqosv.webp	2025-11-22 00:43:53.292088	d3e405cf-82d2-4142-b98d-3b05e21dec0b	\N
a5b34d31-db8a-4b6e-a0d1-6e1ba88ddbc9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747037/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Lesac-Be/dxlleap4d9qcekl2hxaf.webp	2025-11-22 00:43:53.292088	c185740b-134e-4f9e-adb9-ec6fa732dff9	\N
7f5ebc0f-cd71-475c-a995-7c95f6972cb0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747036/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20%C4%91eo%20vai%20n%E1%BB%AF%20LESAC-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-Lesac-Latte/klyxnryacjwfj8mnfj3s.webp	2025-11-22 00:43:53.292088	0dbfa85a-162e-4791-8197-25710fb0c241	\N
11d3c05b-8e74-44a0-955c-80aa5fe8efbe	df18b151-0c8e-45a9-996e-e5a390c6c36b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747246/fashion_ecommerce/product/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC/faxpxly8qydrem6ty5jn.webp	2025-11-22 00:47:23.979128	\N	\N
1251e10a-c0ed-4df1-87d8-8d2600162d98	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747247/fashion_ecommerce/product/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-Xanh/ibaagcsjlxlsvtsj5oa6.webp	2025-11-22 00:47:23.979128	9bbe4863-0a5f-4500-9d57-95629b616341	\N
5f1fba20-8cb8-4a34-b089-4988ad584f7c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747247/fashion_ecommerce/product/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-V%C3%A0ng/vkvbk7m2ualgq231mt6q.webp	2025-11-22 00:47:23.979128	4daff98e-af09-4bc3-86f0-7aec4d9c83e5	\N
ad1d54d7-c4f6-4e84-a8fb-afa6ec052a95	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747247/fashion_ecommerce/product/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-H%E1%BB%93ng/h5chc8ldtjqa5oevolz5.webp	2025-11-22 00:47:23.979128	37527654-71b8-44b7-977f-4d2ce2d98212	\N
6797cf2c-729d-4a52-ae77-2a71313eba27	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747248/fashion_ecommerce/product/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC/variant/T%C3%BAi%20mini%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20LESAC-T%C3%BAi%20x%C3%A1ch-Lesac-Tr%E1%BA%AFng/uefgvcnjqgc5xk2gb5vi.webp	2025-11-22 00:47:23.979128	5d524c1b-5fbb-4a0e-9f1c-e0ecfb38edec	\N
2f390bbd-9058-4d2d-b8ea-fa83a472dca1	21614097-a4f1-4478-94dd-bc5814781390	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747526/fashion_ecommerce/product/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20LESAC%20Mikala%20Bag/pylezbsgmnvxnfwmx7cr.webp	2025-11-22 00:52:03.178157	\N	\N
37f3931f-3bb7-48f1-88f4-a4350ef6b4de	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747526/fashion_ecommerce/product/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20LESAC%20Mikala%20Bag/variant/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20LESAC%20Mikala%20Bag-T%C3%BAi%20x%C3%A1ch-Lesac-%C4%90en/zmttkeg2qdzfvwsplobc.webp	2025-11-22 00:52:03.178157	23fd3630-e4fe-44e1-b2d4-9b69cd3a9ef6	\N
65c32df2-dfe5-4bac-a26f-de838d9970f0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747527/fashion_ecommerce/product/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20LESAC%20Mikala%20Bag/variant/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20LESAC%20Mikala%20Bag-T%C3%BAi%20x%C3%A1ch-Lesac-Milky/idjvlknd6xavz3h2alb4.webp	2025-11-22 00:52:03.178157	549ca905-0ff2-434f-9ce8-113c0582a154	\N
b2f6a6aa-2594-41e5-8b55-f8c3797a1bc1	9916b12c-1aed-4559-a137-831ba0a7a135	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747937/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/ir1crojpxwgywo2urwed.webp	2025-11-22 00:58:54.662991	\N	\N
0f7dd8f6-ecca-476a-8751-d1c481d13c36	9916b12c-1aed-4559-a137-831ba0a7a135	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747937/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/t97vpfrrfpcrpydsjfd0.webp	2025-11-22 00:58:54.662991	\N	\N
3c94b6a5-c615-49fc-b090-e62a577ab378	9916b12c-1aed-4559-a137-831ba0a7a135	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747936/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/pkjp9rlywfou063nkkh7.webp	2025-11-22 00:58:54.662991	\N	\N
f90edd32-e7d4-4170-86e6-dfaa190512c5	9916b12c-1aed-4559-a137-831ba0a7a135	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747937/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/aeflcvxy9oljeqwhixfp.webp	2025-11-22 00:58:54.662991	\N	\N
63f27c94-86a6-4ab3-b659-465c40756d39	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747938/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet-V%C3%AD%20n%E1%BB%AF-Lesac-%C4%90en/g8wrk6o0aqqtbst775fo.webp	2025-11-22 00:58:54.662991	b96ed547-4dd4-4bc4-b400-5677dd47e657	\N
c5686ab9-c7a6-465f-8bb0-da4402fcf4a8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747938/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet-V%C3%AD%20n%E1%BB%AF-Lesac-%C4%90%E1%BB%8F/seutm39yj3qmmjbynks6.webp	2025-11-22 00:58:54.662991	01cc6604-1e18-45ea-8226-e525dcc196dd	\N
5f3ce737-c691-46c8-b731-61dd87c97a65	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763747938/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Nina%20Wallet-V%C3%AD%20n%E1%BB%AF-Lesac-Be/tbgtgts2pmv1p48ohx4q.webp	2025-11-22 00:58:54.662991	06ea799b-a91f-47bd-97e9-e02f0272380c	\N
2926744c-534a-47de-87eb-cac7d5318fee	10dda6b6-0dc6-4275-bfaf-79d42b4f3981	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748095/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet/zangaq2yy3prtgg54uog.webp	2025-11-22 01:01:33.500018	\N	\N
d4b887d0-4b1f-4efa-87d2-b3f36d7b477d	10dda6b6-0dc6-4275-bfaf-79d42b4f3981	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748095/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet/uprxhluxpo5pim3nl0j3.webp	2025-11-22 01:01:33.500018	\N	\N
afc351f2-bd3a-427e-b93c-ef0fa9ba6f34	10dda6b6-0dc6-4275-bfaf-79d42b4f3981	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748095/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet/xegc3ntspoy9govjrbma.webp	2025-11-22 01:01:33.500018	\N	\N
73a5cd91-ff88-4101-8d13-3c52b6234200	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748097/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet-V%C3%AD%20n%E1%BB%AF-Lesac-%C4%90en/drpzfwwu5cjccwcsjhje.webp	2025-11-22 01:01:33.500018	a9a46b7a-71d6-465e-84fe-536f48212a27	\N
079c680f-5320-4a5f-b823-808667bb32f8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748097/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC%20Stand%20Wallet-V%C3%AD%20n%E1%BB%AF-Lesac-H%E1%BB%93ng/caxjsfdk5w9ansbhnbfx.webp	2025-11-22 01:01:33.500018	80b1dade-8654-4f03-9e0c-67d201c97e0a	\N
2cf59f5d-2df5-4c75-91ca-26ef9a7e235a	f71f0055-6d01-48e4-8f8c-a66f252beee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748478/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/aa17k1btgvkqyjmqyipc.webp	2025-11-22 01:07:55.451212	\N	\N
cc85ef9e-1e87-4ca8-9e00-07dad5616bef	f71f0055-6d01-48e4-8f8c-a66f252beee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748477/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/lcmlinh6qgybmv3wugtx.webp	2025-11-22 01:07:55.451212	\N	\N
83ae1bed-42a7-4bc0-b72a-9c180a004b05	f71f0055-6d01-48e4-8f8c-a66f252beee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748477/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/meeqddfobtjafgvb3bf2.webp	2025-11-22 01:07:55.451212	\N	\N
9f871bca-5c0e-4c6a-b77f-d3f772a9f544	f71f0055-6d01-48e4-8f8c-a66f252beee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748478/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/fevoer8rwxbv7celw22a.webp	2025-11-22 01:07:55.451212	\N	\N
d3a640b3-c735-4fb9-a11a-250bc4032e9c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748479/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC-V%C3%AD%20n%E1%BB%AF-Lesac-%C4%90en/vfg86jx7472xhpcysp7l.webp	2025-11-22 01:07:55.451212	180f8ff0-cfe7-4a61-9afd-ceefedf602ed	\N
7b6835a1-8f40-48a4-bc61-467fcc141940	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748479/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC-V%C3%AD%20n%E1%BB%AF-Lesac-Tr%E1%BA%AFng/kj4jcirsz2u3xxjjvtpx.webp	2025-11-22 01:07:55.451212	1f5fc79f-a4c6-47a7-a84f-73b545d5ddaf	\N
474114a1-f214-414d-9b24-cd5ec23ed2b1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748479/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC/variant/V%C3%AD%20n%E1%BB%AF%20mini%20LESAC-V%C3%AD%20n%E1%BB%AF-Lesac-B%E1%BA%A1c/fbmu3vtymddxxdp7wc6n.webp	2025-11-22 01:07:55.451212	ba26ebb9-eebb-4fa8-bb61-6fc03eaa8215	\N
e575b5e1-8434-486f-894a-0cdfd906bc7b	8d2f3138-d789-49d5-9685-700010cef9c2	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748685/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BA%ADn%20n%E1%BB%AF%20oval/xv4sntlghdtzil9vlwxw.webp	2025-11-22 01:11:22.811508	\N	\N
e5cfbe61-6624-4c71-9328-e91ca2f60a8b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748686/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BA%ADn%20n%E1%BB%AF%20oval/variant/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BA%ADn%20n%E1%BB%AF%20oval-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en/n1gm0qujwafuyengyeyu.webp	2025-11-22 01:11:22.811508	c1033304-7005-494e-a9c0-37b60ba39e99	\N
f24691da-4636-4740-bec4-7992db0f2a62	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748686/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BA%ADn%20n%E1%BB%AF%20oval/variant/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BA%ADn%20n%E1%BB%AF%20oval-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20tr%E1%BA%AFng/eiqnjt6yb6hzurdtqrqf.webp	2025-11-22 01:11:22.811508	328b1205-c6fc-4574-9c00-2d859b36246a	\N
a9bcdcec-6769-4771-8ce9-d22482ff8a92	80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748745/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR/bw5iwwgukphufjcjbi5v.webp	2025-11-22 01:12:22.467824	\N	\N
aaadc23d-756e-4411-9958-82f05c832ed4	80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748745/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR/brf9nlfpaqdxpqh8fay7.webp	2025-11-22 01:12:22.467824	\N	\N
b331b9f1-3202-4c85-b90b-bf0fd94d25a0	80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748745/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR/bzq5q3qlukzjieikvoau.webp	2025-11-22 01:12:22.467824	\N	\N
9137cf13-1cc9-4f96-b3d9-32945312eff3	80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748744/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR/vadm9yrp4rukwcfaoyus.webp	2025-11-22 01:12:22.467824	\N	\N
f132ec19-0719-466b-84b3-91b0bd1d15fa	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748746/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR/variant/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR-V%C3%AD%20Nam-UNDERTHINKER-Ngang/j5igj2xeaatpnkbdppbd.webp	2025-11-22 01:12:22.467824	93f7b864-4196-4039-9eeb-2c09cbf7a483	\N
9c26baba-dbdb-46b2-b44a-3aa16d9d5f37	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748746/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR/variant/V%C3%AD%20Da%20Nam%20Monogram%20AMOUR-V%C3%AD%20Nam-UNDERTHINKER-%C4%90%E1%BB%A9ng/ncnhfprzapvjeuic8usp.webp	2025-11-22 01:12:22.467824	44de312f-a1d5-4981-b31d-b2317b7a9d35	\N
4d523f9c-53ce-49a8-b7d3-3e2abfee6eae	d575be52-133b-41d9-9039-8e67b038fa06	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748924/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram/wj9voeqcqutgnuaxtpvg.webp	2025-11-22 01:15:22.368199	\N	\N
290114e3-ff7e-4068-aa08-39fd9b09d03d	d575be52-133b-41d9-9039-8e67b038fa06	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748924/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram/yndrwtd7gi4sxlxevzl1.webp	2025-11-22 01:15:22.368199	\N	\N
8d6ba613-80e4-47d1-be59-d375a8911a6b	d575be52-133b-41d9-9039-8e67b038fa06	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748924/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram/ak9kjm1ac6mpqp52z7ki.webp	2025-11-22 01:15:22.368199	\N	\N
6b818ed6-23fe-4593-b06f-4ac2f3b16789	d575be52-133b-41d9-9039-8e67b038fa06	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748925/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram/bimj8ujbzyj0ecmjwd9k.webp	2025-11-22 01:15:22.368199	\N	\N
edab1293-15ed-4752-9dbe-b646443b4bdd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748926/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram/variant/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram-V%C3%AD%20Nam-UNDERTHINKER-Ngang/wnzr9wwxzajarifjt1sk.webp	2025-11-22 01:15:22.368199	e6705c1a-da46-48e2-8d61-e8b7d248427f	\N
eff9d00b-7bb7-416b-b8df-736d72c9232e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748926/fashion_ecommerce/product/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram/variant/V%C3%AD%20Da%20Nam%20SOLAR%20Monogram-V%C3%AD%20Nam-UNDERTHINKER-%C4%90%E1%BB%A9ng/qzxaj6fbovy4scqia2wd.webp	2025-11-22 01:15:22.368199	0e708936-574c-4767-bb50-5b2262c40e5c	\N
c5d84d5f-3c6b-4a8a-9e02-e54900786d83	4e6e2cae-5c0b-45a0-9ffa-b522ea3539a7	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748942/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF/ukxj11couysa43d63kco.webp	2025-11-22 01:15:39.968584	\N	\N
84950646-89ed-4f61-9cc3-209fa07f1c6f	4e6e2cae-5c0b-45a0-9ffa-b522ea3539a7	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748942/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF/ix07185xs7uhqqvndgbp.webp	2025-11-22 01:15:39.968584	\N	\N
9bd975d7-58a6-4a41-a0fd-fd3a29089c52	4e6e2cae-5c0b-45a0-9ffa-b522ea3539a7	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748943/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF/nchd5l9xsxt19re18wyl.webp	2025-11-22 01:15:39.968584	\N	\N
88d5d0fb-f9c7-4198-b699-b73776d4d36a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748943/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF/variant/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-Tr%E1%BA%AFng/jptezibvpmqfxfub1gz7.webp	2025-11-22 01:15:39.968584	441cdfbf-64d0-4871-83d8-248468ef0da9	\N
f274190a-b24f-486c-8f77-062df5bd1aee	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763748943/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF/variant/G%E1%BB%8Dng%20k%C3%ADnh%20%C4%91a%20gi%C3%A1c%20n%E1%BB%AF-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-H%E1%BB%93ng/lpmh0qtf6bed1baty3to.webp	2025-11-22 01:15:39.968584	c433ec79-7c2a-4edf-848e-2fc3752ed72d	\N
6790f894-00ae-42bb-bada-7344b2a28426	7421a801-320d-45d0-a565-20acf7f84c74	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749096/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF/i5t3i8lc4lnrd88vv9il.webp	2025-11-22 01:18:14.604839	\N	\N
2b58244d-bd34-48a3-97af-8872f05494f0	7421a801-320d-45d0-a565-20acf7f84c74	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749096/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF/ketbwynza9wkfzhgvopg.webp	2025-11-22 01:18:14.604839	\N	\N
ddde3e8c-49e1-497d-84ca-99fb53ae7092	7421a801-320d-45d0-a565-20acf7f84c74	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749097/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF/k2kxx1hdx1uqwckvr0ia.webp	2025-11-22 01:18:14.604839	\N	\N
d62a6c73-baf9-46f7-a6b7-dfcd7c73bf17	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749098/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20nh%C3%A1m/euj1eolttsvwwi86lsnn.webp	2025-11-22 01:18:14.604839	2f6bb1f9-07f9-4ae6-94cb-9c85e040e84c	\N
cb28abf7-1692-4016-8b9c-18f125ee487c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749098/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20tr%C3%B2n%20nam%20n%E1%BB%AF-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20b%C3%B3ng/qacabuipjg9i9kimhcmi.webp	2025-11-22 01:18:14.604839	ecc61eee-abaf-486a-9f36-c7c5e9972f89	\N
7e5fefa9-fdfd-4c41-ab04-3e1c7b014c5e	faebc957-3d05-4c7c-abaf-278a5aa6aee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749106/fashion_ecommerce/product/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN/jppzncvibbjmrez5kzto.webp	2025-11-22 01:18:24.015192	\N	\N
94f8c729-5a0e-4e31-8b4a-e89200f8bf2e	faebc957-3d05-4c7c-abaf-278a5aa6aee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749106/fashion_ecommerce/product/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN/hlacfw0g7eccdmenbx7p.webp	2025-11-22 01:18:24.015192	\N	\N
74822212-e3bc-483c-a3f4-acc20931fcf0	faebc957-3d05-4c7c-abaf-278a5aa6aee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749107/fashion_ecommerce/product/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN/nbisershwhrnndl9ncnn.webp	2025-11-22 01:18:24.015192	\N	\N
41f82d66-9049-484e-9e87-b0e448a9453b	faebc957-3d05-4c7c-abaf-278a5aa6aee5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749106/fashion_ecommerce/product/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN/ptdj1krr3idkh44b1lfm.webp	2025-11-22 01:18:24.015192	\N	\N
bc4c2002-8a28-4cb7-9253-9d5b2e0b7832	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749108/fashion_ecommerce/product/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN/variant/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN-V%C3%AD%20Nam-UNDERTHINKER-%C4%90en/k5iuetk0oxos9krznnsa.webp	2025-11-22 01:18:24.015192	3295b413-a6d2-4c7d-a565-3c2be08f6062	\N
5ee5ef8d-f380-450d-875e-54bced928b8f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749108/fashion_ecommerce/product/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN/variant/V%C3%AD%20Da%20G%E1%BA%ADp%20Ba%20Nam%20N%E1%BB%AF%20LOGAN-V%C3%AD%20Nam-UNDERTHINKER-%C4%90en%20ph%E1%BB%91i%20cam/e1a4rb1y5gjkbzrrgo8x.webp	2025-11-22 01:18:24.015192	adf8750d-7dd4-489d-bb7f-bf3c68614b2d	\N
eaa841cc-ea38-4851-8313-1077f58be1b8	159b0c07-b24e-4fa0-b85c-9e4f3bfe244e	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749212/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20n%E1%BB%AF%20m%E1%BA%AFt%20oval%20kim%20lo%E1%BA%A1i/jlqwdevzskts9huriqik.webp	2025-11-22 01:20:10.085176	\N	\N
15d3af20-705d-416e-a747-81ca6605fbce	159b0c07-b24e-4fa0-b85c-9e4f3bfe244e	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749213/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20n%E1%BB%AF%20m%E1%BA%AFt%20oval%20kim%20lo%E1%BA%A1i/aepqlrkzvsebfwlcvaes.webp	2025-11-22 01:20:10.085176	\N	\N
08eaba4a-cf79-4f05-9179-0869bbd57838	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749213/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20n%E1%BB%AF%20m%E1%BA%AFt%20oval%20kim%20lo%E1%BA%A1i/variant/G%E1%BB%8Dng%20k%C3%ADnh%20n%E1%BB%AF%20m%E1%BA%AFt%20oval%20kim%20lo%E1%BA%A1i-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20tr%E1%BA%AFng/jo6tkzeeleddykf5zrtr.webp	2025-11-22 01:20:10.085176	5eb69340-0226-4331-9334-8da073708fc1	\N
2d3855aa-1cdb-4c7e-be30-54b3a32e0b6f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749214/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20n%E1%BB%AF%20m%E1%BA%AFt%20oval%20kim%20lo%E1%BA%A1i/variant/G%E1%BB%8Dng%20k%C3%ADnh%20n%E1%BB%AF%20m%E1%BA%AFt%20oval%20kim%20lo%E1%BA%A1i-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en/x732h3sxthfs7duyhui7.webp	2025-11-22 01:20:10.085176	b60d475e-c74f-4376-a2e0-b08a268e2cd8	\N
70af921e-6d2a-4d4c-8d74-9349734dfaa0	5dc9f680-cdda-44a9-9bf8-51688a32f426	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749318/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE/cjem3mtmzfo0p5emital.webp	2025-11-22 01:21:55.782503	\N	\N
2ad58bb9-9d3d-4956-b004-8e65d7d68750	5dc9f680-cdda-44a9-9bf8-51688a32f426	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749318/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE/m7qewzlgeuficvymvoxr.webp	2025-11-22 01:21:55.782503	\N	\N
8de84f4a-cf64-4bcc-b440-bcbab64f0a2e	5dc9f680-cdda-44a9-9bf8-51688a32f426	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749317/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE/oqtvrsp6jqvid56kkful.webp	2025-11-22 01:21:55.782503	\N	\N
aa2a7150-6416-4bc7-9195-ad21633a323b	5dc9f680-cdda-44a9-9bf8-51688a32f426	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749318/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE/kov9s2oqai3qlpzkykvh.webp	2025-11-22 01:21:55.782503	\N	\N
9b1e1133-30da-4ab5-a106-67d2e31edac2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749319/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-UNDERTHINKER-%C4%90en%20ph%E1%BB%91i%20n%C3%A2u/n7nwqdyq6p6ovzp3rhpm.webp	2025-11-22 01:21:55.782503	f69094c3-f711-4580-a5df-6cd28086897b	\N
91698881-d4ae-40da-8d42-060a7cf7ff46	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749319/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20DANTE-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-UNDERTHINKER-%C4%90en/r8zuw3rmis7qxchy58ar.webp	2025-11-22 01:21:55.782503	59d2cd3d-ffdf-4c0f-b24e-8e9f6f7b1e4a	\N
ad00d837-74ec-4856-8085-7a8be5d8a39a	c6967f8e-0e52-4327-a7ef-dc238d043224	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749654/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/nwhyuopalilsjyuesirn.webp	2025-11-22 01:27:33.125941	\N	\N
8bc37d63-416b-455e-9fd3-64d95353c147	c6967f8e-0e52-4327-a7ef-dc238d043224	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749654/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/shxtv6wxuhdshj2ueonm.webp	2025-11-22 01:27:33.125941	\N	\N
72564f36-2deb-4756-9bd5-7c52e298737e	c6967f8e-0e52-4327-a7ef-dc238d043224	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749654/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/uf0auv8o2nmgffdhizx2.webp	2025-11-22 01:27:33.125941	\N	\N
098a950b-5f2a-4446-a323-f4c9d2c2b48b	c6967f8e-0e52-4327-a7ef-dc238d043224	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749654/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/eesit5gypxji6zhjympn.webp	2025-11-22 01:27:33.125941	\N	\N
007e74d7-8134-48bb-92d5-a8fc13120a9e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749655/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK-V%C3%AD%20Nam-UNDERTHINKER-T%C3%BAi%20slock%20bag/wbhftoxv5nwkdyojgimo.webp	2025-11-22 01:27:33.125941	f4c078ba-fb7c-4d5e-9177-cfea93f0e448	\N
94d5dbf1-eb1c-4437-a6bd-740a16b9daa4	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749656/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK-V%C3%AD%20Nam-UNDERTHINKER-T%C3%BAi%20slock%20bag/fbtgsvzhys5oggjeyuzg.webp	2025-11-22 01:27:33.125941	f4c078ba-fb7c-4d5e-9177-cfea93f0e448	\N
a57c17b7-9bf0-4029-9772-92dcea340937	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749655/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK-V%C3%AD%20Nam-UNDERTHINKER-T%C3%BAi%20slock%20bag/e2dhylhwiexejbu5fmrp.webp	2025-11-22 01:27:33.125941	f4c078ba-fb7c-4d5e-9177-cfea93f0e448	\N
3f1d5be0-5d02-4150-a1ae-9a04e7e6a13b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749655/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK-V%C3%AD%20Nam-UNDERTHINKER-T%C3%BAi%20slock%20bag/qvkzsjrowaa6xhez1fqk.webp	2025-11-22 01:27:33.125941	f4c078ba-fb7c-4d5e-9177-cfea93f0e448	\N
1e65c81d-d6d0-4994-a2eb-160ac4bb276e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749656/fashion_ecommerce/product/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK/variant/T%C3%BAi%20Da%20Nam%20N%E1%BB%AF%20Monogram%20SLOCK-V%C3%AD%20Nam-UNDERTHINKER-T%C3%BAi%20phone%20bag/tmrh5yq74vcxmphu2yl3.webp	2025-11-22 01:27:33.125941	3857c9ec-6db0-4030-aefe-18db1c62e770	\N
6c883c55-7ac2-4998-977c-38c1c6066d03	aa1181c1-13af-4d18-b081-d606013573ce	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749721/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20ch%E1%BA%A5t%20li%E1%BB%87u%20Titan/dmo3dghyul9vos0ykkm1.webp	2025-11-22 01:28:38.880719	\N	\N
02aa9789-a3de-440c-9a06-a102c84ee86a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749722/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20ch%E1%BA%A5t%20li%E1%BB%87u%20Titan/variant/G%E1%BB%8Dng%20k%C3%ADnh%20ch%E1%BA%A5t%20li%E1%BB%87u%20Titan-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20tr%E1%BA%AFng/cuxssik2o75dzyfxyj9z.webp	2025-11-22 01:28:38.880719	ef7fcf5f-1c13-4d78-8c5e-f3a3cd18643c	\N
0f8ebd37-2632-478a-87b2-70943c3b588e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749722/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20ch%E1%BA%A5t%20li%E1%BB%87u%20Titan/variant/G%E1%BB%8Dng%20k%C3%ADnh%20ch%E1%BA%A5t%20li%E1%BB%87u%20Titan-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en/iflqncg3icjthsophgcn.webp	2025-11-22 01:28:38.880719	15c71cfd-a912-4755-8b63-08928be7d730	\N
17bd8d9f-4f70-4037-8916-b2a66a513455	f30d900c-fceb-4e89-961c-ac81e02530a1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749827/fashion_ecommerce/product/V%C3%AD%20Da%20REX/yrnfyvom0ntinunnj1bm.webp	2025-11-22 01:30:26.989601	\N	\N
f7e69972-1a94-4a4d-a837-59fa199c1f77	f30d900c-fceb-4e89-961c-ac81e02530a1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749829/fashion_ecommerce/product/V%C3%AD%20Da%20REX/t0qyyvjvy46tgolmqqo4.webp	2025-11-22 01:30:26.989601	\N	\N
a57f2bd6-cd50-4b51-8bd9-168a97e61d48	f30d900c-fceb-4e89-961c-ac81e02530a1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749827/fashion_ecommerce/product/V%C3%AD%20Da%20REX/vu4gjzobkpra2wfr9bea.webp	2025-11-22 01:30:26.989601	\N	\N
6975f5cf-33b9-4b39-9747-951373834bf3	f30d900c-fceb-4e89-961c-ac81e02530a1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749827/fashion_ecommerce/product/V%C3%AD%20Da%20REX/thevsm1ig6p919ypj0p5.webp	2025-11-22 01:30:26.989601	\N	\N
09e840c0-cda2-489c-a2d9-68dc7bb429ae	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763749831/fashion_ecommerce/product/V%C3%AD%20Da%20REX/variant/V%C3%AD%20Da%20REX-V%C3%AD%20Nam-UNDERTHINKER-%C4%90en/lpvyrwp9a3c0sagcmloe.webp	2025-11-22 01:30:26.989601	ce8e30c1-d30e-42aa-aed3-9fed3006b4c8	\N
5150e2c0-b978-40d2-b7aa-67ed410a88a8	4b02b03d-87c1-471d-a139-24fdc45541c9	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750032/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20nh%E1%BB%B1a%20c%E1%BB%A9ng%20c%C3%A1p/b49bc77dx3fmmsxxp77z.webp	2025-11-22 01:33:49.836729	\N	\N
da7b0072-9632-4d80-965c-28544560e25d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750033/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20nh%E1%BB%B1a%20c%E1%BB%A9ng%20c%C3%A1p/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20nh%E1%BB%B1a%20c%E1%BB%A9ng%20c%C3%A1p-K%C3%ADnh%20m%C3%A1t-Lilywear-Ghi/exvzjgjpwt8sge92cade.webp	2025-11-22 01:33:49.836729	46f07f1a-78fb-4d91-a468-87a9d25647fb	\N
c4753929-4dda-4cfb-b280-8bc115efb9ab	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750033/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20nh%E1%BB%B1a%20c%E1%BB%A9ng%20c%C3%A1p/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20nh%E1%BB%B1a%20c%E1%BB%A9ng%20c%C3%A1p-K%C3%ADnh%20m%C3%A1t-Lilywear-H%E1%BB%93ng/ipebbflngxgt0gecfz0x.webp	2025-11-22 01:33:49.836729	bde100cf-03b7-40a4-9087-f82b8294b018	\N
6d7a7212-5a41-45a7-a22b-42082088c6aa	76bb9b2a-7805-4461-b924-e3d0c06a77b5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750088/fashion_ecommerce/product/V%C3%AD%20%C4%90%E1%BB%A9ng%20Da%20%C4%90%E1%BB%B1ng%20Th%E1%BA%BB/fyopxsh9dc5i3ebqndia.webp	2025-11-22 01:34:45.427627	\N	\N
bb211ada-8783-479f-8dde-4f9877ddb05a	76bb9b2a-7805-4461-b924-e3d0c06a77b5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750087/fashion_ecommerce/product/V%C3%AD%20%C4%90%E1%BB%A9ng%20Da%20%C4%90%E1%BB%B1ng%20Th%E1%BA%BB/xi0h3n0iwlh2vn0osl2b.webp	2025-11-22 01:34:45.427627	\N	\N
689a5865-e809-4f2f-9bef-d66c3cb62ca0	76bb9b2a-7805-4461-b924-e3d0c06a77b5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750087/fashion_ecommerce/product/V%C3%AD%20%C4%90%E1%BB%A9ng%20Da%20%C4%90%E1%BB%B1ng%20Th%E1%BA%BB/bbnwi3dt2hvmatxqictk.webp	2025-11-22 01:34:45.427627	\N	\N
6320ea0a-b791-4dcf-9d59-8a0ef0bf524f	76bb9b2a-7805-4461-b924-e3d0c06a77b5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750087/fashion_ecommerce/product/V%C3%AD%20%C4%90%E1%BB%A9ng%20Da%20%C4%90%E1%BB%B1ng%20Th%E1%BA%BB/vlsrxob2kzjyrwj6muid.webp	2025-11-22 01:34:45.427627	\N	\N
50773323-3efe-4512-b71e-04dad54220a1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750089/fashion_ecommerce/product/V%C3%AD%20%C4%90%E1%BB%A9ng%20Da%20%C4%90%E1%BB%B1ng%20Th%E1%BA%BB/variant/V%C3%AD%20%C4%90%E1%BB%A9ng%20Da%20%C4%90%E1%BB%B1ng%20Th%E1%BA%BB-V%C3%AD%20Nam-UNDERTHINKER-%C4%90en/s5mb6v2u3asgtkt2tjvk.webp	2025-11-22 01:34:45.427627	c1fc770c-5985-4198-a3eb-19b84f38820c	\N
e27cc976-992b-4acc-bddd-cc4fd9f48bdf	65595694-dc73-40b5-b1e9-b7663e86b027	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750206/fashion_ecommerce/product/K%C3%ADnh%20m%E1%BA%AFt%20nam%20n%E1%BB%AF%20tr%C3%B2n%20to/oyjbcljzxqrioki5d4qi.webp	2025-11-22 01:36:43.903285	\N	\N
58874513-dc9b-4a21-ba16-63957beadb42	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750207/fashion_ecommerce/product/K%C3%ADnh%20m%E1%BA%AFt%20nam%20n%E1%BB%AF%20tr%C3%B2n%20to/variant/K%C3%ADnh%20m%E1%BA%AFt%20nam%20n%E1%BB%AF%20tr%C3%B2n%20to-K%C3%ADnh%20m%C3%A1t-Lilywear-Tr%E1%BA%AFng%20v%C3%A0ng/ydb1tdmaz7dt2zwzfjqi.webp	2025-11-22 01:36:43.903285	3284e4c4-e954-4f5a-bf79-a17e4e8bbce7	\N
167d3aac-5ee0-4fc7-8e23-c4247076d780	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750207/fashion_ecommerce/product/K%C3%ADnh%20m%E1%BA%AFt%20nam%20n%E1%BB%AF%20tr%C3%B2n%20to/variant/K%C3%ADnh%20m%E1%BA%AFt%20nam%20n%E1%BB%AF%20tr%C3%B2n%20to-K%C3%ADnh%20m%C3%A1t-Lilywear-N%C3%A2u/wuaacdjnwvmcpp6uaohc.webp	2025-11-22 01:36:43.903285	8241c6f1-1bcb-4841-a2b3-e183bf3a6540	\N
6c46a8c0-d464-4a62-9a3f-9980c176dbd5	f413b48a-852b-40be-8b84-d52b589dc8fb	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750281/fashion_ecommerce/product/T%C3%BAi%20H%E1%BB%99p%20Da%20%C4%90eo%20Ch%C3%A9o%20PERRY/ziqxyeovhfw3yyojxp5z.webp	2025-11-22 01:37:59.294365	\N	\N
26699ddb-34f3-4427-82fe-08ba7f6c0495	f413b48a-852b-40be-8b84-d52b589dc8fb	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750282/fashion_ecommerce/product/T%C3%BAi%20H%E1%BB%99p%20Da%20%C4%90eo%20Ch%C3%A9o%20PERRY/sdbewo8tyja2kdwdvqce.webp	2025-11-22 01:37:59.294365	\N	\N
0e8aebee-6348-4047-ae39-e03888f0c038	f413b48a-852b-40be-8b84-d52b589dc8fb	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750280/fashion_ecommerce/product/T%C3%BAi%20H%E1%BB%99p%20Da%20%C4%90eo%20Ch%C3%A9o%20PERRY/denavyw9kyscixldl1at.webp	2025-11-22 01:37:59.294365	\N	\N
89f75b92-6c97-4368-8659-973a6e11e821	f413b48a-852b-40be-8b84-d52b589dc8fb	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750280/fashion_ecommerce/product/T%C3%BAi%20H%E1%BB%99p%20Da%20%C4%90eo%20Ch%C3%A9o%20PERRY/jwejunhvritselgmr2sq.webp	2025-11-22 01:37:59.294365	\N	\N
c32fbf8c-4d61-44f5-a970-77bb90ab2a3e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750283/fashion_ecommerce/product/T%C3%BAi%20H%E1%BB%99p%20Da%20%C4%90eo%20Ch%C3%A9o%20PERRY/variant/T%C3%BAi%20H%E1%BB%99p%20Da%20%C4%90eo%20Ch%C3%A9o%20PERRY-T%C3%BAi%20%C4%91eo%20ch%C3%A9o-UNDERTHINKER-%C4%90en/mdryngci0ppjp3oboglt.webp	2025-11-22 01:37:59.294365	e322f7c6-15e2-49e1-9310-bc2b3dc56164	\N
3e75b9a6-a02c-4bb0-a0dc-2604e26618f0	552d1685-d268-43c6-96a3-152faf60cb19	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750428/fashion_ecommerce/product/K%C3%ADnh%20g%E1%BB%8Dng%20tr%C3%B2n%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/zn6pdhz78xcbvu6mvjoo.webp	2025-11-22 01:40:25.749006	\N	\N
d3db0136-25af-4c77-a8e2-95b94c623cae	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750429/fashion_ecommerce/product/K%C3%ADnh%20g%E1%BB%8Dng%20tr%C3%B2n%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/variant/K%C3%ADnh%20g%E1%BB%8Dng%20tr%C3%B2n%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-X%C3%A1m%20nh%E1%BA%A1t/nb2ycdx2skd8imovnh37.webp	2025-11-22 01:40:25.749006	e8384f20-6322-4de1-8fd6-2ca89f5c5fdb	\N
3c20547e-608a-4495-8857-09a680edffeb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750429/fashion_ecommerce/product/K%C3%ADnh%20g%E1%BB%8Dng%20tr%C3%B2n%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/variant/K%C3%ADnh%20g%E1%BB%8Dng%20tr%C3%B2n%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en/psxqnlm7ud6kpiwdqwfs.webp	2025-11-22 01:40:25.749006	785068b0-3bba-42c6-aa29-0355b4a0e30e	\N
ec7f9e77-46f5-44cb-88af-82588896604e	d9a7b733-5b82-42bf-b279-22791f057658	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750920/fashion_ecommerce/product/%C3%81o%20Hoodie%20Morning%20Star%20Bunny/chge97fr89oqq0fbkn5x.webp	2025-11-22 01:48:38.505082	\N	\N
3c9d922f-2c46-4d00-b84a-1dd8f613813f	d9a7b733-5b82-42bf-b279-22791f057658	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750920/fashion_ecommerce/product/%C3%81o%20Hoodie%20Morning%20Star%20Bunny/g6r0ylwa0qcpz6msrs8j.webp	2025-11-22 01:48:38.505082	\N	\N
73930957-7b26-48a8-8d5e-88c371147f45	d9a7b733-5b82-42bf-b279-22791f057658	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750921/fashion_ecommerce/product/%C3%81o%20Hoodie%20Morning%20Star%20Bunny/ram9yecay0e0yuia7gts.webp	2025-11-22 01:48:38.505082	\N	\N
c648f938-4036-4239-b8b1-04db39a814b6	d9a7b733-5b82-42bf-b279-22791f057658	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750921/fashion_ecommerce/product/%C3%81o%20Hoodie%20Morning%20Star%20Bunny/oegoovh3k2rssm8inloz.webp	2025-11-22 01:48:38.505082	\N	\N
a912352c-47cf-4496-b7b1-aac07b9b26ea	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763750922/fashion_ecommerce/product/%C3%81o%20Hoodie%20Morning%20Star%20Bunny/variant/%C3%81o%20Hoodie%20Morning%20Star%20Bunny-%C3%81o%20Hoodie-Teelab-Kem/zbizqpwuqcyhjpt5ksno.webp	2025-11-22 01:48:38.505082	402d387e-d08a-4e39-a84b-4472ad66fc74	\N
700bb483-85c4-4134-a9a4-80c51f19ed38	80275163-3c62-48ee-b03e-574eea49687f	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751345/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey/n675zywrfbnggqp9nzv0.webp	2025-11-22 01:55:45.629673	\N	\N
14b6a20a-8675-4486-97b9-cfd54b79d4df	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751346/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey/variant/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey-%C3%81o%20thun-Teelab-Tr%E1%BA%AFng/nlmijxcbsyds8boglczi.webp	2025-11-22 01:55:45.629673	0518291d-4ca8-4938-b3fb-b113899bc8e9	\N
ced3861a-711a-4b8e-b1cc-0cdb76d3d22f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751349/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey/variant/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey-%C3%81o%20thun-Teelab-Xanh%20than/d3dijd4eifm8lvam11bl.webp	2025-11-22 01:55:45.629673	24b650c4-1e74-4f49-a39e-732cb56a6c10	\N
6f87a45c-b43a-4a3b-ae90-a39fd2f2de59	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751347/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey/variant/%C3%81o%20Thun%20Teelab%20Basketball%20Jersey-%C3%81o%20thun-Teelab-%C4%90en/jmrhnakgm2xgi6hiszv2.webp	2025-11-22 01:55:45.629673	7ae14af9-d46c-4c81-9a51-fcc0b4763940	\N
6a7596cc-c2da-45b6-831a-cb4031362b48	a6954114-27c7-479c-ab67-5eb106420bcf	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751536/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line/vgf3yhfptmv2i4rwgysr.webp	2025-11-22 01:58:53.7582	\N	\N
b86060b1-c45c-403b-80f1-5f983a1cf435	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751537/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line/variant/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line-%C3%81o%20thun-Teelab-%C4%90en/spbjholmsb1emx2rbctg.webp	2025-11-22 01:58:53.7582	85975aa0-a03c-4431-8e64-cbc4fe6cdffb	\N
195f0ef1-a9e4-45f2-9ecf-97e769122099	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751537/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line/variant/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line-%C3%81o%20thun-Teelab-X%C3%A1m/bfywom3juryuy2wojitu.webp	2025-11-22 01:58:53.7582	ad683076-5b41-4045-87df-75634b1d170c	\N
54fff282-fe2e-424d-8657-323bb6944c68	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751536/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line/variant/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line-%C3%81o%20thun-Teelab-Be/wwc0dckl7rfdr0kf3vta.webp	2025-11-22 01:58:53.7582	5d02b776-a946-490d-bf0d-ed21c6c7ec1a	\N
301371a8-e67a-4d66-8712-d72e45c6acc9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751537/fashion_ecommerce/product/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line/variant/%C3%81o%20Thun%20Teelab%20Sporty%20Side-Line-%C3%81o%20thun-Teelab-Xanh%20%C4%91en/oq840oqy3ledh0oafiww.webp	2025-11-22 01:58:53.7582	9dd6b4f7-a1d4-4777-8e28-ee12aa44c2d3	\N
b4934a8d-d446-4823-8f94-48fb463ce5aa	8ec6ce6d-2227-4f33-8e83-67b84d9087a8	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751750/fashion_ecommerce/product/%C3%81o%20Thun%20Wash%20Rodeos/rzwfsn27v0ff4tgfsfit.webp	2025-11-22 02:02:29.492357	\N	\N
dddb1823-4a14-4124-aec5-c58644b46305	8ec6ce6d-2227-4f33-8e83-67b84d9087a8	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751750/fashion_ecommerce/product/%C3%81o%20Thun%20Wash%20Rodeos/fnzmaej3ucypogwqiwfg.webp	2025-11-22 02:02:29.492357	\N	\N
c17db166-1965-4897-9d72-3b0733d7e3ae	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751752/fashion_ecommerce/product/%C3%81o%20Thun%20Wash%20Rodeos/variant/%C3%81o%20Thun%20Wash%20Rodeos-%C3%81o%20thun-Teelab-wash%20x%C3%A1m/wqezjkccfex2rlvp5l8d.webp	2025-11-22 02:02:29.492357	791414cb-5c7a-467e-a200-7b6212c309b5	\N
a3a13a7a-5d2d-4402-b262-5cab063c360a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751752/fashion_ecommerce/product/%C3%81o%20Thun%20Wash%20Rodeos/variant/%C3%81o%20Thun%20Wash%20Rodeos-%C3%81o%20thun-Teelab-wash%20n%C3%A2u/fmjlve0b4phwtdlriywh.webp	2025-11-22 02:02:29.492357	478de674-fa60-4a5e-b443-562a53148e5c	\N
1d85a4ce-1096-43d4-acea-c165399685d4	ee61f1a8-b86b-4a3c-8007-a387357958f9	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751908/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20ch%E1%BB%91ng%20%C3%A1nh%20s%C3%A1ng%20xanh/fn16sioddrdbuzw56ge4.webp	2025-11-22 02:05:06.244889	\N	\N
875e9fa9-6714-4602-8c88-e1513845ce7a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751909/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20ch%E1%BB%91ng%20%C3%A1nh%20s%C3%A1ng%20xanh/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20ch%E1%BB%91ng%20%C3%A1nh%20s%C3%A1ng%20xanh-K%C3%ADnh%20m%C3%A1t-Lilywear-%C4%90en/wc3enliuxlgz7qfbidai.webp	2025-11-22 02:05:06.244889	a279a487-4c49-4f52-9c0b-cc22b3eccd5d	\N
a3a6e2d1-f9f3-45c2-b644-7e601781d896	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751909/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20ch%E1%BB%91ng%20%C3%A1nh%20s%C3%A1ng%20xanh/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20ch%E1%BB%91ng%20%C3%A1nh%20s%C3%A1ng%20xanh-K%C3%ADnh%20m%C3%A1t-Lilywear-Ghi/qniqqvgzv06q7pyzx6u8.webp	2025-11-22 02:05:06.244889	bab793ec-b9b2-4df9-b8b5-84c77ae688db	\N
73788336-92b6-4656-a3be-3519535c8571	8d66e327-bce2-451f-822b-9eb027495e6b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751920/fashion_ecommerce/product/%C3%81o%20Thun%20Slow%20Sunday%20T-Shirt/u1aabzjkmzc5vabp2tvp.webp	2025-11-22 02:05:19.116977	\N	\N
58bbb10a-76e3-4ab8-bd46-6b2860fada71	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751921/fashion_ecommerce/product/%C3%81o%20Thun%20Slow%20Sunday%20T-Shirt/variant/%C3%81o%20Thun%20Slow%20Sunday%20T-Shirt-%C3%81o%20thun-Teelab-%C4%90en/j91xnpr8kifeaycuthvv.webp	2025-11-22 02:05:19.116977	099c0c7e-7fb6-4711-af8e-6b89741288a1	\N
b69c0617-e5e6-47b7-9899-345e66cec2e9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751921/fashion_ecommerce/product/%C3%81o%20Thun%20Slow%20Sunday%20T-Shirt/variant/%C3%81o%20Thun%20Slow%20Sunday%20T-Shirt-%C3%81o%20thun-Teelab-Kem/stlqu4jabjidkzk8tj5p.webp	2025-11-22 02:05:19.116977	bf3531f6-1187-4b20-a7d4-a2d8d247b61c	\N
3697b238-3f7d-422c-a555-0b4d9132bc99	6a88af12-6b0a-47b2-9516-f2cbef7a4081	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751996/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20th%E1%BB%9Di%20trang/wa9zeakkhlie1gverxq7.webp	2025-11-22 02:06:34.23241	\N	\N
2cacb2ea-8c8d-4f67-b27d-9c6741689cb6	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763751998/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20th%E1%BB%9Di%20trang/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20nam%20th%E1%BB%9Di%20trang-K%C3%ADnh%20m%C3%A1t-Lilywear-H%E1%BB%93ng/fbw03zenzljiz4x913oa.webp	2025-11-22 02:06:34.23241	91583eb9-c21c-4937-801b-f714d5b66cd1	\N
a87d1951-31b8-4bf8-a072-935bb06f22a0	f5b43ac7-eec0-4217-8204-e38ceca74632	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752088/fashion_ecommerce/product/%C3%81o%20Thun%20Keyboard%20Form%20R%E1%BB%99ng/fm7gpmxsketp60zhkris.webp	2025-11-22 02:08:05.119082	\N	\N
6f608683-0dd2-4acd-bf8f-f26c4a1234b2	f5b43ac7-eec0-4217-8204-e38ceca74632	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752088/fashion_ecommerce/product/%C3%81o%20Thun%20Keyboard%20Form%20R%E1%BB%99ng/znphmtite2yeidw5g4cp.webp	2025-11-22 02:08:05.119082	\N	\N
d49de48b-dafe-4251-9bb9-c883854592fe	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752089/fashion_ecommerce/product/%C3%81o%20Thun%20Keyboard%20Form%20R%E1%BB%99ng/variant/%C3%81o%20Thun%20Keyboard%20Form%20R%E1%BB%99ng-%C3%81o%20thun-Teelab-Tr%E1%BA%AFng/e3jw0gjnztbtvdhv1zde.webp	2025-11-22 02:08:05.119082	ece315e6-70a2-4acf-9b89-4eeb64498b98	\N
9f3f2ab9-efd2-45e2-b0b8-7014b1b02556	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752089/fashion_ecommerce/product/%C3%81o%20Thun%20Keyboard%20Form%20R%E1%BB%99ng/variant/%C3%81o%20Thun%20Keyboard%20Form%20R%E1%BB%99ng-%C3%81o%20thun-Teelab-X%C3%A1m%20ti%C3%AAu/nkripkuthtrvjtebanvd.webp	2025-11-22 02:08:05.119082	16f297c4-20db-43c6-93f4-f589802f0eab	\N
2f707446-fb21-4519-894c-149fababff76	ede10d4a-99f5-4a5c-85b7-fa4fac464fa5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752146/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/stb1ofnpjubavzpxlnmb.webp	2025-11-22 02:09:06.273248	\N	\N
98c4df9e-a276-4bbb-a42d-a60bbaf0493c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752147/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en/rm26ao1dyf8xbwcsevi6.webp	2025-11-22 02:09:06.273248	e4df1006-ba66-443d-9226-d4bdb3d55e14	\N
50fdd633-2f08-4328-ad0b-662f61d80a7e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752147/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-V%C3%A0ng/tvvdnv1f76nsupmckybb.webp	2025-11-22 02:09:06.273248	e87ca598-d957-4a47-b328-9faec07c2770	\N
1d8269e6-febb-4dbc-ae1b-866422b5cf4d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752148/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20Oval%20m%C3%A0u%20s%E1%BA%AFc%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-Tr%E1%BA%AFng/uouq69qx1v6ofaw3bk6r.webp	2025-11-22 02:09:06.273248	06393df3-cf6c-4559-b102-d15d1fd5680d	\N
e212152d-8941-492a-b5cc-e91710a13da3	54f193bc-c235-43e6-8736-54f5e0844064	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752290/fashion_ecommerce/product/%C3%81o%20Thun%20Mini%20Icons%20Tshirt/vnlwl3ccyxpyqqyeranl.webp	2025-11-22 02:11:27.083353	\N	\N
a9cdbca7-0ec8-4a18-9bc6-f2a1b37748a4	54f193bc-c235-43e6-8736-54f5e0844064	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752290/fashion_ecommerce/product/%C3%81o%20Thun%20Mini%20Icons%20Tshirt/nb3qemhmpe8wpyexcmyr.webp	2025-11-22 02:11:27.083353	\N	\N
8d1e7c94-83cd-4ccf-a546-85e789cba27c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752291/fashion_ecommerce/product/%C3%81o%20Thun%20Mini%20Icons%20Tshirt/variant/%C3%81o%20Thun%20Mini%20Icons%20Tshirt-%C3%81o%20thun-Teelab-%C4%90en/wnnzx3xkstneshqluhxx.webp	2025-11-22 02:11:27.083353	e1cdd71f-519b-41bd-852a-2869f734e204	\N
3e030524-0b39-49b0-b563-7bccda2199cd	72a09739-6b1a-49a5-9837-a7d782b71b13	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752546/fashion_ecommerce/product/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic/sc6jtb1jtvklikx1xggl.webp	2025-11-22 02:15:45.163057	\N	\N
2b16c0fd-286d-40ff-a184-83489eb1de4a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752547/fashion_ecommerce/product/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic/variant/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic-%C3%81o%20Hoodie%20-%20Sweater-Teelab-%C4%90en/zmbw3nexsicgazxqwnai.webp	2025-11-22 02:15:45.163057	65adcde1-8ec1-4557-9533-069b032a5c3e	\N
894ef0e4-24d3-4252-865b-fdaea6abf3f2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752547/fashion_ecommerce/product/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic/variant/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic-%C3%81o%20Hoodie%20-%20Sweater-Teelab-X%C3%A1m%20ghi/pjt9rfd8dwtrzxgvajk0.webp	2025-11-22 02:15:45.163057	aa471a50-2699-4c37-8261-a1b8fff08af7	\N
0f1fd34b-7d3b-4932-9556-bfe0ee0d5158	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752548/fashion_ecommerce/product/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic/variant/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic-%C3%81o%20Hoodie%20-%20Sweater-Teelab-Xanh%20navy/wo5unowysbpa37nnynh4.webp	2025-11-22 02:15:45.163057	8c204a16-f565-4deb-a862-e903796f49e4	\N
510bc6ff-690a-4154-b4e1-110f80c2a293	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752548/fashion_ecommerce/product/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic/variant/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic-%C3%81o%20Hoodie%20-%20Sweater-Teelab-X%C3%A1m%20ti%C3%AAu/gvo8iymbba7is7mgv4en.webp	2025-11-22 02:15:45.163057	6cad0572-df54-4195-8389-a6d2da0dd317	\N
1a04c560-d0d3-4fd1-9852-ea91151d6ce7	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752548/fashion_ecommerce/product/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic/variant/%C3%81o%20Polo%20Sweater%20N%E1%BB%89%20Ch%C3%A2n%20Cua%20Basic-%C3%81o%20Hoodie%20-%20Sweater-Teelab-%C4%90%E1%BB%8F/uybd8p44en2tcefugdqn.webp	2025-11-22 02:15:45.163057	3a4f5ef0-16ed-46bb-9182-0317b9fc1ed2	\N
218abfb5-48e8-4a93-817d-90ea5dbd306e	44df2435-da86-44aa-ab4d-2901eb203d4e	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752732/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang/pbeel6ahh30j26mgyev7.jpg	2025-11-22 02:18:50.129207	\N	\N
2b3d3637-5b9d-4d3c-a344-eeaa7659959c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752733/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20x%C3%A1m/nekq2aacstxom6lq3vg9.webp	2025-11-22 02:18:50.129207	3a489c75-9727-4347-a01c-54d5823230bd	\N
f70d27c5-0ed6-4a6a-a1a0-6cc27dc01116	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752733/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-V%C3%A0ng%20nh%E1%BA%A1t/emyfywiuglf08ewng5to.webp	2025-11-22 02:18:50.129207	04f5bc4c-be1b-42da-9948-3605769e965a	\N
a72b9cb5-f577-4850-896c-f1d9ae797c23	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752734/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20c%E1%BB%95%20%C4%91i%E1%BB%83n%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-%C4%90en%20trong/x2rurllahgr3glem5n9n.webp	2025-11-22 02:18:50.129207	4e962e4b-2c3a-45f8-b0ef-05dff7677ea7	\N
f1b43fe3-c3aa-465d-b22b-f26020b7fa43	dadfbde5-a74d-48d9-9f03-1af9943a92ed	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752736/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc/cjd78wu1jqhmkf76skbf.webp	2025-11-22 02:18:54.232664	\N	\N
4b10f875-5f1f-4678-81f8-4ab792e61c88	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752737/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc/variant/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc-%C3%81o%20s%C6%A1%20mi-Teelab-Xanh/iwupo9plhflnmnw31mmu.webp	2025-11-22 02:18:54.232664	d744d0c8-9420-4574-b863-99416a8d3124	\N
8ca29e1f-52f3-4929-8d2c-708fc80bdb24	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752738/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc/variant/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc-%C3%81o%20s%C6%A1%20mi-Teelab-X%C3%A1m/wq2khzbpek1kueycq9ra.webp	2025-11-22 02:18:54.232664	b5bb2533-fbe6-4bcf-b67c-03c4a76e8e7b	\N
3ca84470-e0ca-470d-85e0-0f780f1cfb88	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752737/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc/variant/%C3%81o%20S%C6%A1%20Mi%20Tay%20D%C3%A0i%20K%E1%BA%BB%20S%E1%BB%8Dc-%C3%81o%20s%C6%A1%20mi-Teelab-H%E1%BB%93ng/xfyqriq5ph4qmlrsleiy.webp	2025-11-22 02:18:54.232664	30b63e57-4774-4189-8b96-0f1cdd11cb21	\N
b6818a90-4ad2-46dd-8270-412819d80d32	b346f32d-4f9b-4343-99f3-044ef538547c	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752877/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang/fejhm0mxborvrtiaccps.webp	2025-11-22 02:21:15.151022	\N	\N
70d95704-bfdc-443b-afe1-64ca93eb3ec0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752877/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-H%E1%BB%93ng%20c%C3%A1nh%20sen/hgkh17xufszlalm3uuec.webp	2025-11-22 02:21:15.151022	62e7a000-0b23-43e1-b62f-9524adef3237	\N
909d4b37-6ef5-4582-b87c-cb785a26c240	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752877/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-Cam%20nh%E1%BA%A1t/gdzenb8s8sxe9qo2soqe.webp	2025-11-22 02:21:15.151022	601dc2c7-45ae-49b3-ab23-1426f564c88c	\N
0ee9c872-5a51-43d1-9737-cb7596c83902	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752877/fashion_ecommerce/product/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang/variant/G%E1%BB%8Dng%20k%C3%ADnh%20m%E1%BA%AFt%20m%C3%A8o%20th%E1%BB%9Di%20trang-G%E1%BB%8Dng%20k%C3%ADnh-Lilywear-Th%E1%BB%A7y%20tinh/zkluezuvfyiu6udpfby0.webp	2025-11-22 02:21:15.151022	0b0198f6-309c-4110-8c8d-004e30d044a9	\N
1365fc48-1da8-460e-9abc-c9d307c9bc42	c2647feb-38af-4b08-ba71-8ae485eee874	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752879/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Gi%C3%B3%20Nam%20N%E1%BB%AF%202%20l%E1%BB%9Bp%20Windbreaker/xdugkbx9khhcudgodjwz.webp	2025-11-22 02:21:16.343086	\N	\N
a10351b0-20b3-4c3c-a0b6-18204343f0fb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763752880/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Gi%C3%B3%20Nam%20N%E1%BB%AF%202%20l%E1%BB%9Bp%20Windbreaker/variant/%C3%81o%20Kho%C3%A1c%20Gi%C3%B3%20Nam%20N%E1%BB%AF%202%20l%E1%BB%9Bp%20Windbreaker-%C3%81o%20Hoodie%20-%20Sweater-Teelab-%C4%90en/ncbpkd2mo61cptyjixjb.webp	2025-11-22 02:21:16.343086	3512b12e-82bf-41e0-8d04-f951e5ca9c88	\N
1ebb7a72-af53-4c79-80e0-9297189c9d1e	8688f9ce-06bd-4ec4-acbd-15d32fd161b8	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753012/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i/s1lqyknbyvofp7r9lnzb.webp	2025-11-22 02:23:29.959772	\N	\N
ede415d1-4f5a-40c5-9921-02036b57ba0d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753013/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i-K%C3%ADnh%20m%C3%A1t-Lilywear-Xanh%20r%C3%AAu/uvwkfi8fferlwnkmvziv.webp	2025-11-22 02:23:29.959772	9a021330-7cb1-46bc-b1fb-56aed5be75d4	\N
97bfda87-2be1-47ca-b581-9cce52b5d1d9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753013/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i-K%C3%ADnh%20m%C3%A1t-Lilywear-Xanh%20ri/donimz8zk6ucl1jkuqvr.webp	2025-11-22 02:23:29.959772	e3bf0e3f-cf7e-440a-a5f4-ba1bba17a5e4	\N
41f52216-6695-42e3-a158-22430e7c4015	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753013/fashion_ecommerce/product/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i/variant/K%C3%ADnh%20gi%E1%BA%A3%20c%E1%BA%ADn%20g%E1%BB%8Dng%20%C4%91a%20gi%C3%A1c%20kim%20lo%E1%BA%A1i-K%C3%ADnh%20m%C3%A1t-Lilywear-V%C3%A0ng%20chanh/lvygwlje8rgk49u6q9qd.webp	2025-11-22 02:23:29.959772	4ca8f3c3-8ce2-43d8-80ee-f51aea8a6745	\N
e3ee1f85-b76d-4cf4-9a1d-75ccfa0d2170	40877b39-0034-46ec-877d-bdc02bfcbffd	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753086/fashion_ecommerce/product/Qu%E1%BA%A7n%20Kaki%20X%E1%BA%BFp%20Ly%20Form%20R%E1%BB%99ng%20%E1%BB%90ng%20Su%C3%B4ng/wtylvp8mbc8betyohvbd.webp	2025-11-22 02:24:43.621138	\N	\N
0f4dca21-2c9b-414f-a9de-49637ad60f2d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753087/fashion_ecommerce/product/Qu%E1%BA%A7n%20Kaki%20X%E1%BA%BFp%20Ly%20Form%20R%E1%BB%99ng%20%E1%BB%90ng%20Su%C3%B4ng/variant/Qu%E1%BA%A7n%20Kaki%20X%E1%BA%BFp%20Ly%20Form%20R%E1%BB%99ng%20%E1%BB%90ng%20Su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Teelab-Kem/rjcocfbg1zvqnzefurdm.webp	2025-11-22 02:24:43.621138	1fafa171-5d52-4a77-ba4f-c84a34e81a36	\N
a3f4be2f-8c66-4ae5-93a5-5225114eced3	3cb525c1-f752-4313-a92b-84c4d206928d	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753249/fashion_ecommerce/product/K%C3%ADnh%200%20%C4%91%E1%BB%99%20nh%E1%BA%B9%20nh%C3%A0ng%20th%E1%BB%9Di%20trang/ayj7zlrnykcbay7pdtm6.webp	2025-11-22 02:27:26.849119	\N	\N
eaa1a6b7-490d-4fca-9d09-264cafac322b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753250/fashion_ecommerce/product/K%C3%ADnh%200%20%C4%91%E1%BB%99%20nh%E1%BA%B9%20nh%C3%A0ng%20th%E1%BB%9Di%20trang/variant/K%C3%ADnh%200%20%C4%91%E1%BB%99%20nh%E1%BA%B9%20nh%C3%A0ng%20th%E1%BB%9Di%20trang-K%C3%ADnh%20m%C3%A1t-Lilywear-Trong%20su%E1%BB%91t/l0bon4vkdxil50pujgia.webp	2025-11-22 02:27:26.849119	97d2bb5a-c94d-4ef2-a438-40e8bbd2167c	\N
b4800f20-784e-49ac-b1dd-10535dfc5de1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753250/fashion_ecommerce/product/K%C3%ADnh%200%20%C4%91%E1%BB%99%20nh%E1%BA%B9%20nh%C3%A0ng%20th%E1%BB%9Di%20trang/variant/K%C3%ADnh%200%20%C4%91%E1%BB%99%20nh%E1%BA%B9%20nh%C3%A0ng%20th%E1%BB%9Di%20trang-K%C3%ADnh%20m%C3%A1t-Lilywear-N%C3%A2u%20%C4%91%E1%BA%A5t/l0mnokbhquzdewfdrqqq.webp	2025-11-22 02:27:26.849119	f67bfe2a-54d6-4a4b-ab96-9a48888d9431	\N
5c7a3643-76fd-463b-bd31-1da7202e12a5	36e08bfd-a6e4-4051-8b92-5d369fcc4a71	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753303/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature/n1riif4aoxa9vcpeq8oa.webp	2025-11-22 02:28:21.247795	\N	\N
c083e571-29a1-45db-b45d-e8d9e1fb43f0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753304/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature/variant/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature-%C3%81o%20s%C6%A1%20mi-Teelab-Xanh/guzfwsoxhgakydijmfs7.webp	2025-11-22 02:28:21.247795	405243ca-d1a3-439f-b26d-c20cd9ae35bd	\N
a1e43bf3-9ec0-4cc3-8619-cdea46e807d8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753305/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature/variant/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature-%C3%81o%20s%C6%A1%20mi-Teelab-%C4%90en/g1ypjvcwyydavun4zykk.webp	2025-11-22 02:28:21.247795	52e1240c-9789-4c56-95d1-fcfe4469f888	\N
9136781b-4f03-4f61-acb7-5dcac1027098	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753305/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature/variant/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature-%C3%81o%20s%C6%A1%20mi-Teelab-H%E1%BB%93ng/r3p3vhpatshfcwrf1lyn.webp	2025-11-22 02:28:21.247795	51e558e7-562b-4fbc-b3a1-7f1f6db8e818	\N
86f33b4d-e0d3-47e7-8b65-e06d6146e27c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753305/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature/variant/%C3%81o%20S%C6%A1%20Mi%20Eco%20Oxford%20Signature-%C3%81o%20s%C6%A1%20mi-Teelab-Tr%E1%BA%AFng/ocwt6vjuou3mmyagq3fx.webp	2025-11-22 02:28:21.247795	dcc24d66-c1e7-4962-b64b-16067fdb0022	\N
5177d30c-00aa-4f82-a9c9-3365ac00fbe7	1b85f0ab-968d-426e-8f30-cd790618b67f	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753414/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20C%E1%BB%99c%20Tay%20Striped%20Boxy/bfu3wlchqyub2rry0vym.webp	2025-11-22 02:30:11.966408	\N	\N
4ebda989-88a3-4592-ba40-102226867dcf	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753415/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20C%E1%BB%99c%20Tay%20Striped%20Boxy/variant/%C3%81o%20S%C6%A1%20Mi%20C%E1%BB%99c%20Tay%20Striped%20Boxy-%C3%81o%20s%C6%A1%20mi-Teelab-%C4%90en/wsjkxggoxzzhhqudy7se.webp	2025-11-22 02:30:11.966408	6015cd96-1845-42be-bf66-49eb2f34f253	\N
422eaf1d-f9e5-4b3d-a1a4-ec15d392c784	7d0663ca-e5c5-458d-b753-b6f4a3f9176c	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753547/fashion_ecommerce/product/%C3%81o%20B%C3%B3ng%20Ch%C3%A0y%20K%E1%BA%BB%20S%E1%BB%8Dc%20Jersey%20Striped/ymw4xjotu9wmlqgdokel.webp	2025-11-22 02:32:26.023275	\N	\N
382229c7-ef85-4c69-b944-cde5e9a4650d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753548/fashion_ecommerce/product/%C3%81o%20B%C3%B3ng%20Ch%C3%A0y%20K%E1%BA%BB%20S%E1%BB%8Dc%20Jersey%20Striped/variant/%C3%81o%20B%C3%B3ng%20Ch%C3%A0y%20K%E1%BA%BB%20S%E1%BB%8Dc%20Jersey%20Striped-%C3%81o%20s%C6%A1%20mi-Teelab-%C4%90en/xqadt9hmry2klzmqqfxx.webp	2025-11-22 02:32:26.023275	31eaeff2-3081-4132-b727-00d835035c9d	\N
6403e043-3e97-45a5-ba84-82d56168ec8e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763753549/fashion_ecommerce/product/%C3%81o%20B%C3%B3ng%20Ch%C3%A0y%20K%E1%BA%BB%20S%E1%BB%8Dc%20Jersey%20Striped/variant/%C3%81o%20B%C3%B3ng%20Ch%C3%A0y%20K%E1%BA%BB%20S%E1%BB%8Dc%20Jersey%20Striped-%C3%81o%20s%C6%A1%20mi-Teelab-%C4%90%E1%BB%8F/vwn7yo8khpo6atphzwak.webp	2025-11-22 02:32:26.023275	a224cc8a-3f87-474d-8ee8-9f1e2cbdbee7	\N
de4fed60-89ff-474e-bb82-f94af8e3bbb2	44ffb6ce-2d0c-43d8-a4f8-344dcc17847a	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829219/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo/qs0vxf2hzes1s4t5hq9h.webp	2025-11-22 23:33:35.458403	\N	\N
d2918e5f-5d1e-420c-85fe-1eb801bb45c3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829220/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo/variant/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo-%C3%81o%20Varsity%20-%20Bomber-Vintino-%C4%90en/b5s9qmusvfnnvzrjlgxf.webp	2025-11-22 23:33:35.458403	49b3fe7c-7b25-425c-ab76-c88905a2df8d	\N
c9948045-4f6e-4a4e-919a-28f0a7dead4a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829221/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo/variant/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo-%C3%81o%20Varsity%20-%20Bomber-Vintino-X%C3%A1m/rafceeztx0qjqy8x2cie.webp	2025-11-22 23:33:35.458403	3f6c46a1-9575-4a34-b1f5-f84ed768b0a5	\N
2192e666-0de1-4ce7-b4fb-da308b1df251	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829221/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo/variant/%C3%81o%20Kho%C3%A1c%20Nam%20VINTINO%20Th%C3%AAu%20Logo-%C3%81o%20Varsity%20-%20Bomber-Vintino-Xanh/gkpoix5h5jzds2rrgn9c.webp	2025-11-22 23:33:35.458403	161e7470-c84a-4d46-ab47-3c910580805b	\N
78c026c3-ef52-4bd0-bd09-d592e27fcd0c	6e0e4f2a-3c49-4b89-b82f-cc2d1a127690	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829432/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp/ffc3bjmtmxcnms62xbrc.webp	2025-11-22 23:37:08.018804	\N	\N
4b8598d5-0365-4b40-b799-0ec9b14231cd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829433/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp/variant/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp-%C3%81o%20Varsity%20-%20Bomber-Vintino-%C4%90en/qcra7se7ej3ske0v6xqd.webp	2025-11-22 23:37:08.018804	c23eb7c6-7aa1-4cb6-bfe4-1c6be1297fd7	\N
ba8ecee2-db10-4308-9672-6c5e388d68a1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829433/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp/variant/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp-%C3%81o%20Varsity%20-%20Bomber-Vintino-Kem/rkbwmt31fa8gl1esvc1n.webp	2025-11-22 23:37:08.018804	7c3a5e3a-ca93-4472-8279-9820feacb9e9	\N
71379962-febe-4acb-b286-23e0401dae44	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829434/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp/variant/%C3%81o%20Kho%C3%A1c%20Bomber%20D%C3%B9%20Hai%20L%E1%BB%9Bp-%C3%81o%20Varsity%20-%20Bomber-Vintino-X%C3%A1m/tikmefcn89chtrurhr5t.webp	2025-11-22 23:37:08.018804	bf3fa4ec-f9d8-4fe8-92d9-d383b272b74c	\N
615bcd7a-7752-48be-87d1-1e9e1ef34b65	5948ad05-3969-43c8-bc89-be43117c2282	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829827/fashion_ecommerce/product/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng/fwg6lfty1dgznsvpuewf.webp	2025-11-22 23:43:43.097149	\N	\N
7a4f2feb-9881-4401-bccc-b6adad913d80	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829828/fashion_ecommerce/product/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng/variant/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng-%C3%81o%20Hoodie%20-%20Sweater-Vintino-%C4%90en/h1jlzc0spamgf2h938qv.webp	2025-11-22 23:43:43.097149	1fb0034e-4907-4678-b13d-1b4da10f8748	\N
e09d2066-436a-4a4a-82f0-1dcf56c8d754	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829829/fashion_ecommerce/product/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng/variant/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng-%C3%81o%20Hoodie%20-%20Sweater-Vintino-X%C3%A1m%20nh%E1%BA%A1t/yh9ww4sjt1adphfgogn2.webp	2025-11-22 23:43:43.097149	b3c45334-3752-42f1-adad-4a2e4f78028d	\N
07af2c45-5bbc-4a8e-9b56-effef45e9f48	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829829/fashion_ecommerce/product/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng/variant/%C3%81o%20Hoodie%20Zip%20Form%20R%E1%BB%99ng-%C3%81o%20Hoodie%20-%20Sweater-Vintino-X%C3%A1m%20%C4%91%E1%BA%ADm/lqxytqnbyoyy7zu90w8s.webp	2025-11-22 23:43:43.097149	e86b0bb4-15fd-48c7-8309-961d330f9a6f	\N
b75f111d-fc84-4153-b06a-5314f1bdea4b	d3e20b93-a1e4-463d-8935-e2afdfa1c369	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830046/fashion_ecommerce/product/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t/jeuvrtf0zfxxs8whymt4.webp	2025-11-22 23:47:21.607344	\N	\N
04234675-7595-4027-9b2e-237c513a2c59	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830047/fashion_ecommerce/product/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t/variant/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t-%C3%81o%20Varsity%20-%20Bomber-Vintino-%C4%90en%20ph%E1%BB%91i%20tr%E1%BA%AFng/munh4wme0edqfaxusgzy.webp	2025-11-22 23:47:21.607344	35cf5495-78c8-427e-8757-9e1afcf7e7fe	\N
f8726f86-f6eb-410c-a5bd-a44fed0c5124	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830047/fashion_ecommerce/product/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t/variant/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t-%C3%81o%20Varsity%20-%20Bomber-Vintino-%C4%90%E1%BB%8F%20ph%E1%BB%91i%20tr%E1%BA%AFng/cq67yjj7rsrj0pl4mhwo.webp	2025-11-22 23:47:21.607344	cefcdb72-84fc-4c54-8bb9-e6fe59d73ede	\N
fa24a90b-77ec-44e7-a7af-760ecdc84431	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830047/fashion_ecommerce/product/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t/variant/A%CC%81o%20Khoa%CC%81c%20Gio%CC%81%202%20M%C4%83%CC%A3t-%C3%81o%20Varsity%20-%20Bomber-Vintino-%C4%90en%20ph%E1%BB%91i%20%C4%91%E1%BB%8F/x09yfntutag2mpxzde5e.webp	2025-11-22 23:47:21.607344	31727b8d-67cc-4690-a10e-b93412dc1394	\N
c70713b5-1a91-4f27-96d7-2998940ebe44	a14e341c-b408-4d64-89eb-174b6ccc29fd	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830197/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry/lrmuity8z0jpydehlbqg.webp	2025-11-22 23:49:54.029155	\N	\N
89a5e880-4aa2-44d2-9626-d4ddbe5bb07f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830199/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry/variant/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry-Qu%E1%BA%A7n%20short-Coolmate-X%C3%A1m/c0p8zx9q1aoawijf2yxz.webp	2025-11-22 23:49:54.029155	7e221b18-7b93-485e-92cf-fab28ffed907	\N
ef42b7ae-a3b7-4b8f-8145-ab6814da934a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830199/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry/variant/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry-Qu%E1%BA%A7n%20short-Coolmate-%C4%90en/zl2ipluhsichpoepbwrb.webp	2025-11-22 23:49:54.029155	7df55ce3-d81f-447b-aa68-57c55215dc9c	\N
706f192d-2427-44c4-a39f-9d1dfb754264	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830200/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry/variant/Qu%E1%BA%A7n%20Shorts%20th%E1%BB%83%20thao%20tho%C3%A1ng%20kh%C3%AD%20Exdry-Qu%E1%BA%A7n%20short-Coolmate-Navy/dn3vzjfcfl1u1vj3kdth.webp	2025-11-22 23:49:54.029155	b2c129a1-a809-4c62-9ac0-6c99aa97b518	\N
ce27f406-4d39-4bc3-bb0e-c85f7ddc09c6	be673b6c-0b78-48df-a2aa-bd9d4b48536c	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830324/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki/eoxrgurje6lrfbo0vazx.webp	2025-11-22 23:51:59.849359	\N	\N
9b67e78a-ec3c-4c83-b31d-a5fa0d26d910	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830325/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki/variant/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki-Qu%E1%BA%A7n%20short-Vintino-Be/icqtbi1d06avwqdk6gj5.webp	2025-11-22 23:51:59.849359	73a2b96e-7e58-45f9-b38c-863796069e2c	\N
74080a95-c708-43d6-a50c-937cd1f99bc0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830325/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki/variant/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki-Qu%E1%BA%A7n%20short-Vintino-%C4%90en/pb5o6dhoky7cwcevyvim.webp	2025-11-22 23:51:59.849359	d988c4ff-f251-464e-83f0-cb9131e32651	\N
3eb3973f-65f6-471c-9742-64edcb004d9a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830325/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki/variant/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki-Qu%E1%BA%A7n%20short-Vintino-Xanh%20r%C3%AAu/p402leeglbdmzuiy6qow.webp	2025-11-22 23:51:59.849359	252dbcd0-dfac-484f-b60d-0ce36e3b1001	\N
7e37fa97-9a3c-4aac-8b25-87157e5661d1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830326/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki/variant/Qu%E1%BA%A7n%20Short%20Nam%20Tr%C6%A1n%20V%E1%BA%A3i%20Kaki-Qu%E1%BA%A7n%20short-Vintino-Tr%E1%BA%AFng/kawscs1kgurigfrpejhh.webp	2025-11-22 23:51:59.849359	f588e0ed-2693-4f99-855f-fa3019f9ddd7	\N
228e8cc8-617c-416f-b6f2-55d9f24a8695	261926a1-8d99-40a6-b10c-2089a738e0dd	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830507/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Jean%20Nam%20Vintino%20Form%20Tr%E1%BA%BB%20Trung/aaxotzfkdlogk2cps3ws.webp	2025-11-22 23:55:05.384308	\N	\N
9cf90b4c-a61a-4fed-99c4-db22b64e366a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830509/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Jean%20Nam%20Vintino%20Form%20Tr%E1%BA%BB%20Trung/variant/Qu%E1%BA%A7n%20Short%20Jean%20Nam%20Vintino%20Form%20Tr%E1%BA%BB%20Trung-Qu%E1%BA%A7n%20short-Vintino-%C4%90en/i3xmhpbmi0vsqqbm82ef.webp	2025-11-22 23:55:05.384308	0c90b758-dba4-4a2a-a5dc-1731f3497bf7	\N
65b6f3cb-d5e3-4c25-95e7-0b4aa06af6a6	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830511/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Jean%20Nam%20Vintino%20Form%20Tr%E1%BA%BB%20Trung/variant/Qu%E1%BA%A7n%20Short%20Jean%20Nam%20Vintino%20Form%20Tr%E1%BA%BB%20Trung-Qu%E1%BA%A7n%20short-Vintino-Xanh%20denim/mm2s1b9x3serueegedt4.webp	2025-11-22 23:55:05.384308	4baee306-8638-45b8-b05b-d7c2a84d9426	\N
5b260442-f539-4462-8b40-ce9f45ad09ab	74b7129b-490a-4fa0-baaa-dfbd7d3d2d8a	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830589/fashion_ecommerce/product/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate/g8vnzqh7laqlk1hlxxhq.webp	2025-11-22 23:56:26.136079	\N	\N
3045ec15-c99b-43f9-9e79-70f862c4365b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830591/fashion_ecommerce/product/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate/variant/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate-Qu%E1%BA%A7n%20short-Coolmate-X%C3%A1m%20s%C3%A1ng/mf2rlqwau7livwkltlkx.webp	2025-11-22 23:56:26.136079	4be78321-638a-46a6-8f1a-4461e493652e	\N
2d9b8b0d-dbb2-4422-bac8-ede0bdbb7a68	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830590/fashion_ecommerce/product/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate/variant/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20l%C3%A1%20%C4%91%E1%BA%ADm/ndxyshodycgs8cf3kvis.webp	2025-11-22 23:56:26.136079	91a32d13-3767-426f-81b7-8d1aef8c6480	\N
c187cf66-9694-48b9-9d06-d20cf8133583	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830591/fashion_ecommerce/product/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate/variant/Qu%E1%BA%A7n%20shorts%20ECC%20Ripstop%20Coolmate-Qu%E1%BA%A7n%20short-Coolmate-%C4%90en/q85y6tm0qqbvdz7b9svu.webp	2025-11-22 23:56:26.136079	26ae6014-d42c-4d1a-b6ae-2bcce267c641	\N
4ca74d02-843c-4c48-94a1-e83a759018ea	7cdbae4c-ed12-481e-96ed-8c395173757e	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830633/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Jean%20%C4%90%C3%B9i%20C%E1%BB%99c%20R%C3%A1ch%20G%E1%BB%91i/yiax3tbwaffbe4mebgze.webp	2025-11-22 23:57:08.814932	\N	\N
794cef2d-81f0-4e4e-8010-d9b7a4fcc644	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830634/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Jean%20%C4%90%C3%B9i%20C%E1%BB%99c%20R%C3%A1ch%20G%E1%BB%91i/variant/Qu%E1%BA%A7n%20Short%20Jean%20%C4%90%C3%B9i%20C%E1%BB%99c%20R%C3%A1ch%20G%E1%BB%91i-Qu%E1%BA%A7n%20short-Vintino-%C4%90en/kuze0rxern8t2exiez4b.webp	2025-11-22 23:57:08.814932	684f3ab2-a962-4947-8155-7bf78a75ec52	\N
72245315-4f3b-4070-b5bb-29d075e300d8	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830634/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Jean%20%C4%90%C3%B9i%20C%E1%BB%99c%20R%C3%A1ch%20G%E1%BB%91i/variant/Qu%E1%BA%A7n%20Short%20Jean%20%C4%90%C3%B9i%20C%E1%BB%99c%20R%C3%A1ch%20G%E1%BB%91i-Qu%E1%BA%A7n%20short-Vintino-X%C3%A1m/hyjdvu3k0pkhuiwbky5p.webp	2025-11-22 23:57:08.814932	fd5835b1-be29-4f7c-9baa-092159230701	\N
02b2c925-fb36-425a-a9d1-cb5374025a17	6bed6005-f417-4c9e-ac03-94f8e8928f56	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830731/fashion_ecommerce/product/Qu%E1%BA%A7n%20Chino%20nam%207%20inch/weznyesmhmcuvceaaat8.webp	2025-11-22 23:58:48.600226	\N	\N
ac9cf915-de32-4c7c-aa16-fd4f5db4ed74	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830732/fashion_ecommerce/product/Qu%E1%BA%A7n%20Chino%20nam%207%20inch/variant/Qu%E1%BA%A7n%20Chino%20nam%207%20inch-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20navy/vwhey8hlmbq8zacrftrg.webp	2025-11-22 23:58:48.600226	505aebbe-277a-418b-b0e6-cc4b9cda9f4d	\N
7c4c4be3-1b73-47b9-b303-044304d26c6f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830732/fashion_ecommerce/product/Qu%E1%BA%A7n%20Chino%20nam%207%20inch/variant/Qu%E1%BA%A7n%20Chino%20nam%207%20inch-Qu%E1%BA%A7n%20short-Coolmate-Tr%E1%BA%AFng/faqghowacokx1ifvdzy4.webp	2025-11-22 23:58:48.600226	1ca7d262-4cc7-4cce-915c-e8f0ee1011de	\N
c85a3930-e13b-4656-afe5-5c025c8d539a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830733/fashion_ecommerce/product/Qu%E1%BA%A7n%20Chino%20nam%207%20inch/variant/Qu%E1%BA%A7n%20Chino%20nam%207%20inch-Qu%E1%BA%A7n%20short-Coolmate-%C4%90en/exkwi2dlzwdtzb8ye3xc.webp	2025-11-22 23:58:48.600226	cc97e1bf-2fb1-4b32-a928-9ca2eae985d9	\N
fb82fa64-3051-40e5-80fe-c248e8e0b4cf	e8decc54-4b81-4835-a928-ae70f62d4144	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830749/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20%C4%90%C3%B9i%20Nam%20N%E1%BB%AF%20T%C3%BAi%20H%E1%BB%99p%20C%C3%BAc%20B%E1%BA%A5m%20V%E1%BA%A3i%20Kaki/wubzqikryle0zihp2cxt.webp	2025-11-22 23:59:04.928774	\N	\N
639c5444-512b-4aee-a638-7159ac587f8c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830751/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20%C4%90%C3%B9i%20Nam%20N%E1%BB%AF%20T%C3%BAi%20H%E1%BB%99p%20C%C3%BAc%20B%E1%BA%A5m%20V%E1%BA%A3i%20Kaki/variant/Qu%E1%BA%A7n%20Short%20%C4%90%C3%B9i%20Nam%20N%E1%BB%AF%20T%C3%BAi%20H%E1%BB%99p%20C%C3%BAc%20B%E1%BA%A5m%20V%E1%BA%A3i%20Kaki-Qu%E1%BA%A7n%20short-Vintino-%C4%90en/zv8bwqhkugbgqwjr15cq.webp	2025-11-22 23:59:04.928774	b9d8bc54-9bcb-4844-af57-ab4b15a26a0f	\N
0aa3d5a6-a5d6-4fe9-b989-489f7d3768e9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830751/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20%C4%90%C3%B9i%20Nam%20N%E1%BB%AF%20T%C3%BAi%20H%E1%BB%99p%20C%C3%BAc%20B%E1%BA%A5m%20V%E1%BA%A3i%20Kaki/variant/Qu%E1%BA%A7n%20Short%20%C4%90%C3%B9i%20Nam%20N%E1%BB%AF%20T%C3%BAi%20H%E1%BB%99p%20C%C3%BAc%20B%E1%BA%A5m%20V%E1%BA%A3i%20Kaki-Qu%E1%BA%A7n%20short-Vintino-Be/esibhibbgryfmg0cnmfv.webp	2025-11-22 23:59:04.928774	a5156913-3849-4ebe-8895-df265451fe56	\N
720e59ed-098b-45e2-91fe-cffcd1cbb605	2d28ac84-8b33-4ba8-998f-6fc19b52f88c	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830988/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F/izfmyqnugcid1duyofio.webp	2025-11-23 00:03:04.983684	\N	\N
2e6aac75-c4b1-4a72-bc2f-ae3287e64a7d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830990/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-%C4%90en/wzgr3qzdkliwawdahczr.webp	2025-11-23 00:03:04.983684	ff92bed7-0ecd-4e67-85a4-dfcb68bf7361	\N
86a3e835-c7a2-4396-8b02-b2e46bcc89fb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830990/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Be/kwuiyiar0l2lqwlvelmo.webp	2025-11-23 00:03:04.983684	8bc7c1f1-2061-46b9-88f9-6e4c8a4823c3	\N
626b6082-354e-42d7-91a1-d1921b48a4cb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830991/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Ghi%20%C4%91%E1%BA%ADm/gzjypctxbhqhu5mpprsb.webp	2025-11-23 00:03:04.983684	1cc5e76c-0c6c-4d89-bc12-e8bb274944e2	\N
8367330b-5490-4724-b960-fb11eb5508bd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830991/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Ghi%20nh%E1%BA%A1t/xhwuaymbqcjbnc6yzc0i.webp	2025-11-23 00:03:04.983684	10f70a31-a3e4-4627-8738-1f5df76a2afa	\N
4e861510-2a28-427c-9cf6-0dba8984e551	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763830991/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20%E1%BB%90ng%20C%C3%B4n%20C%C3%B4ng%20S%E1%BB%9F-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Xanh%20than/nyjzpnu6zebgztd6kxtg.webp	2025-11-23 00:03:04.983684	0eef047a-eb9b-4271-8628-642f46e19e6a	\N
2b57743c-ab80-4497-9086-c43efe1792f3	b32f0184-66b2-4da1-ae07-a53d522a8991	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831035/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Th%E1%BB%83%20Thao%20Promax-S1/wnevtmiyijhg9ssiukqo.webp	2025-11-23 00:03:52.418356	\N	\N
5f6837b2-8ced-4770-ad9e-ab56d9a7bf97	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831036/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Th%E1%BB%83%20Thao%20Promax-S1/variant/Qu%E1%BA%A7n%20Short%20Nam%20Th%E1%BB%83%20Thao%20Promax-S1-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20navy/iqrlif4t6ivu7ozshicr.webp	2025-11-23 00:03:52.418356	d22fd479-5231-40a6-9c17-879c2a906d8a	\N
0c4e0d04-6584-42a9-a51f-6f60e442569a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831037/fashion_ecommerce/product/Qu%E1%BA%A7n%20Short%20Nam%20Th%E1%BB%83%20Thao%20Promax-S1/variant/Qu%E1%BA%A7n%20Short%20Nam%20Th%E1%BB%83%20Thao%20Promax-S1-Qu%E1%BA%A7n%20short-Coolmate-%C4%90en/j79qkfptypdy3baq9c7l.webp	2025-11-23 00:03:52.418356	775575b6-b3c3-4b24-9ab7-0acc86551d99	\N
844162ff-3649-4ebf-8970-1b26246a4e02	17129133-69e0-4be2-9b2f-2b32a406474e	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831190/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/zu7v1rouwoytrbwscqfx.webp	2025-11-23 00:06:28.49407	\N	\N
00b0a78a-1e78-499b-aaea-3504f7200c8d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831193/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/variant/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts-Qu%E1%BA%A7n%20short-Coolmate-X%C3%A1m/bcsorfq8nk3a4ypx0ucj.webp	2025-11-23 00:06:28.49407	0e676dc4-5468-4bd9-998d-e5f52a656f43	\N
b4c738cf-a931-4ce8-8cb1-f0f512c10dfd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831193/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/variant/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20r%C3%AAu/auc8km7jc0dfxhn0c0nk.webp	2025-11-23 00:06:28.49407	21105801-1a7e-4a98-85f5-d3b13e592d33	\N
7d44973b-a7df-4a6d-b90a-e7061b282473	fd104ffe-9365-4607-ac3c-984671638ba0	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831316/fashion_ecommerce/product/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1/wnhtcfxzkxboigpfnn3f.webp	2025-11-23 00:08:34.729574	\N	\N
cc8287b0-03db-4225-abe8-4357b83a8185	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831317/fashion_ecommerce/product/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1/variant/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1-Qu%E1%BA%A7n%20short-Coolmate-Xanh/iva6d0tplvkodyhiqwv7.webp	2025-11-23 00:08:34.729574	03ccafbd-3a65-4262-abca-b7ea3454b0be	\N
14c402a0-5bdd-42f2-b42d-2cfefcec9a82	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831317/fashion_ecommerce/product/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1/variant/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20navy/hxlu5ozvfkcohekxbqzv.webp	2025-11-23 00:08:34.729574	06bfd6bc-58da-436e-936a-696639d0abb2	\N
8173a047-5b22-4972-8320-1546d1ef01af	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831318/fashion_ecommerce/product/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1/variant/Qu%E1%BA%A7n%20short%20th%E1%BB%83%20thao%20nam%20Promax-S1-Qu%E1%BA%A7n%20short-Coolmate-%C4%90en%20nh%E1%BA%A1t/dddxj7vrjuhp4rgjb5kg.webp	2025-11-23 00:08:34.729574	9c704ec3-f310-44a2-bb2c-adc643fdba3c	\N
a9ec9729-6cf4-45e5-82e1-4f36fc3b1b0e	155f54ef-0bfd-497b-9227-cbbb490fe679	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831342/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy/nq3l6z8ofjklvniztkmy.webp	2025-11-23 00:08:58.962744	\N	\N
0b111b08-60a5-4bc2-a116-ced26e828ddb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831343/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-%C4%90en/itngv5nwmuy92mi4naqv.webp	2025-11-23 00:08:58.962744	b0ede5a4-b3b1-4c7e-a4f5-7a9ed8834f80	\N
045f3eb1-f845-4e91-a44e-d789203e8c75	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831344/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Be/aoaqxjieqi4a6tbw5nxu.webp	2025-11-23 00:08:58.962744	1c9834dd-09ad-4d96-bc8b-6a44bfdbd454	\N
4899960c-5a71-4a13-be69-017f3a7d9a70	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831344/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy/variant/Qu%E1%BA%A7n%20%C3%82u%20Nam%20H%C3%A0n%20Qu%E1%BB%91c%20D%C3%A1ng%20Baggy-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-X%C3%A1m%20%C4%91%E1%BA%ADm/o4eyluirvyknmcbqumxh.webp	2025-11-23 00:08:58.962744	3a12ad41-36e8-4915-a4c2-479306089eeb	\N
b50a8ad9-8693-4f14-ae5c-94aa82e40d25	c9fa5e7f-0a47-4bb5-8b0d-e2119803a990	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831472/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/stwpdneudh6kuso98bue.webp	2025-11-23 00:11:08.337589	\N	\N
55935d7c-34ca-4ef1-b65d-f7a0370e07c9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831473/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/variant/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20d%C6%B0%C6%A1ng/ig3djdcluv9latqoljjy.webp	2025-11-23 00:11:08.337589	3f6602ad-e161-4e89-8c0e-5ff8e2632382	\N
2ec0c172-cfa9-4b8e-8c2e-f3f34e85c97f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831473/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/variant/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts-Qu%E1%BA%A7n%20short-Coolmate-X%C3%A1m%20tro/wk8ajyl7ru8ldchggdos.webp	2025-11-23 00:11:08.337589	5058cc17-e34d-4af2-8323-53dd478dc46a	\N
c00fe7e3-0927-4f11-81d4-669304747bde	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831474/fashion_ecommerce/product/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts/variant/Qu%E1%BA%A7n%20Th%E1%BB%83%20Thao%20Nam%207%22%20Ultra%20Shorts-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20navy/bagn8nudntmocp2zlnik.webp	2025-11-23 00:11:08.337589	90a8fb82-81ec-42e3-a9c6-631ba2373ba5	\N
03a0bed5-26b3-42f7-9df3-154705f3b72c	ecb37d0b-6f27-4ee9-9209-5fbb6f19c900	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831506/fashion_ecommerce/product/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng/uwmjnugvvckbicncabei.webp	2025-11-23 00:11:41.787414	\N	\N
8bf0d3ee-0f0b-4640-a57b-d68589b39ddd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831507/fashion_ecommerce/product/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-%C4%90en/ixtfvnmbdlj4yk5jftkj.webp	2025-11-23 00:11:41.787414	6773469f-5821-4a4b-b640-efd57f2ca2bf	\N
1363cab9-98bf-4e64-bdf4-04a9537d2b8d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831507/fashion_ecommerce/product/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Kem/iycyjsr7qcrna2e2f87o.webp	2025-11-23 00:11:41.787414	54fb5cd9-7551-4516-b034-f39fcb795d97	\N
a18e7e21-7ccd-482d-a31f-1deb20cdb3b9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831507/fashion_ecommerce/product/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20t%C3%A2y%20nam%20H%C3%A0n%20Qu%E1%BB%91c%20d%C3%A1ng%20baggy%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Ghi/udlv06ntv9xv9cj0qpov.webp	2025-11-23 00:11:41.787414	6718d8ce-0fbe-4e62-94db-e3c70c5869fb	\N
fd88985d-d7ed-48ae-9162-c662adecbe25	25b54462-1033-4b54-9b0b-01584883b4c4	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831574/fashion_ecommerce/product/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch/vjoqlow2fvth3lmgf1zp.webp	2025-11-23 00:12:49.937148	\N	\N
064347d8-2834-4bcc-9a4c-fa9fc2f78618	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831575/fashion_ecommerce/product/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch/variant/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch-Qu%E1%BA%A7n%20short-Coolmate-Xanh%20d%C6%B0%C6%A1ng/zni9xlovugjvewgb5w7q.webp	2025-11-23 00:12:49.937148	f88fca3c-33df-432c-aab6-fdafd9680653	\N
f43263ad-3c46-42b0-bbb4-18c3eeed8a0c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831575/fashion_ecommerce/product/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch/variant/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch-Qu%E1%BA%A7n%20short-Coolmate-Ghi/elx2ymicrl8rigaxnr2l.webp	2025-11-23 00:12:49.937148	4448a46f-bf8d-47b4-bb65-d66912b9a208	\N
858954b1-2438-4942-9f9e-c046246da7b3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831576/fashion_ecommerce/product/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch/variant/Qu%E1%BA%A7n%20nam%20Travel%20Shorts%207inch-Qu%E1%BA%A7n%20short-Coolmate-%C4%90en/dgvkxf60nhpz01rqna0p.webp	2025-11-23 00:12:49.937148	bef4cd98-7bc8-4b25-b402-01a73c2a4fa0	\N
b2203268-eda7-4864-a932-aa120bef1fc4	0185afdd-daf1-4976-ab63-cf18e8a89e41	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831752/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng/mowg3doj1r803466k9b7.webp	2025-11-23 00:15:47.686064	\N	\N
5844b3da-c16f-4744-86ea-5d9319234e20	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831752/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Be/px2grtpzr8wcgwc3ik3l.webp	2025-11-23 00:15:47.686064	a2c7b698-e937-47d8-b715-bba802eca5dc	\N
80b9bd46-146e-48e6-b237-30565a03de31	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831752/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Ghi/ahgmukjxmd2l9w0vlspm.webp	2025-11-23 00:15:47.686064	f02c56e4-3ed4-4683-809e-89d44f30395c	\N
88916fb9-9f24-48d2-b306-5c2d4ffb950f	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831752/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-N%C3%A2u/fhie9bwukikgp9ktoxcw.webp	2025-11-23 00:15:47.686064	6ed2766f-9d78-4b79-a781-43007dde9e71	\N
bf58e60d-c921-488b-aa92-9d41cd10f457	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831753/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-%C4%90en/u2spe5hzqo3qicbb6kul.webp	2025-11-23 00:15:47.686064	8505c51d-bb1f-4fa8-b16d-95711e36a950	\N
7968bf7a-f24f-4bda-9416-c9cf99e2499e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831753/fashion_ecommerce/product/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng/variant/Qu%E1%BA%A7n%20%C3%A2u%20nam%20sidetab%20%E1%BB%91ng%20su%C3%B4ng-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Xanh%20than/lyto8idm6arsr9iylfrr.webp	2025-11-23 00:15:47.686064	b1834874-ede6-4220-b46e-3ea5023e7c2a	\N
cbbd6a0b-db6c-4c12-912b-a879d1b29c32	0269d2c8-25d2-4b3a-9e9a-6baed2a5d87f	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831771/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20Nam%20New%20French%20Terry%20V2/bbtpghwxxbbtg1k4uude.webp	2025-11-23 00:16:06.504491	\N	\N
f9160940-f250-406a-bea0-ae27c87aae56	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831772/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20Nam%20New%20French%20Terry%20V2/variant/Qu%E1%BA%A7n%20Shorts%20Nam%20New%20French%20Terry%20V2-Qu%E1%BA%A7n%20short-Coolmate-X%C3%A1m%20%C4%91%E1%BA%ADm/ndmxocmp3785v3glgaq1.webp	2025-11-23 00:16:06.504491	3607e94f-eed3-4a13-9d86-0d77ce469e94	\N
a204bad2-60f5-46c1-bc71-c9082e4325c0	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831772/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20Nam%20New%20French%20Terry%20V2/variant/Qu%E1%BA%A7n%20Shorts%20Nam%20New%20French%20Terry%20V2-Qu%E1%BA%A7n%20short-Coolmate-X%C3%A1m%20nh%E1%BA%A1t/aednn1texkxlwlbezaav.webp	2025-11-23 00:16:06.504491	5e79cf63-d1b1-42ee-a302-488ad31df804	\N
33dba940-21b8-47f9-8704-825792f8367e	7c4c1ba9-1370-468d-9543-e36d9bb5aeaf	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831894/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20Th%E1%BB%83%20Thao%205%22%20Moving/lwyaobcjehgbrpfppyfp.webp	2025-11-23 00:18:08.975174	\N	\N
9509f706-8b74-49af-83de-2de15bca032d	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763831895/fashion_ecommerce/product/Qu%E1%BA%A7n%20Shorts%20Th%E1%BB%83%20Thao%205%22%20Moving/variant/Qu%E1%BA%A7n%20Shorts%20Th%E1%BB%83%20Thao%205%22%20Moving-Qu%E1%BA%A7n%20short-Lilywear-Tr%E1%BA%AFng/mgfnrjtxjm5p5rxhhvh5.webp	2025-11-23 00:18:08.975174	fdcadd56-cbaa-4bf0-bdf1-8677199506f5	\N
e1344da3-bd70-4345-ae5d-ff14a1756b4f	bb03c0a3-8447-4f80-b70f-adf1fceaade6	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832177/fashion_ecommerce/product/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao/e1yjw82431sfv6woc4ex.webp	2025-11-23 00:22:54.71008	\N	\N
8be87b49-0139-4462-858a-b18e902c0db4	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832178/fashion_ecommerce/product/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao/variant/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Ghi/vnvdhbd42xplyhzqfhxl.webp	2025-11-23 00:22:54.71008	0b460e1c-dc7a-4671-ab7e-18d1d140717a	\N
b850b729-479c-47dc-a590-c005f0413a57	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832180/fashion_ecommerce/product/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao/variant/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-Be/lfg3yb71q0rfsbwjwker.webp	2025-11-23 00:22:54.71008	6c12f607-66d9-4d78-be16-0db41a6dff4d	\N
1d9b6790-e454-48c4-97ad-70b34b13ec51	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832179/fashion_ecommerce/product/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao/variant/Qu%E1%BA%A7n%20T%C3%A2y%20Nam%20VINTINO%20C%E1%BA%A1p%20Cao-Qu%E1%BA%A7n%20%C3%82u%20-%20%E1%BB%90ng%20su%C3%B4ng-Vintino-%C4%90en/ny6ivo6cq6sqkisal1kf.webp	2025-11-23 00:22:54.71008	fa19d3b2-995c-4bf3-9426-7d9afff74595	\N
56124d8e-2faa-4fc5-9222-3be452d4d2f1	9d2820dd-bfb6-4cdb-93ea-0e77a794b993	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832306/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nam%20form%20r%E1%BB%99ng%20c%E1%BB%95%20ch%E1%BB%AF%20V%20d%C3%A0i%20tay/x2eyq8nuksmzdxf8ma2n.webp	2025-11-23 00:25:01.008285	\N	\N
941b280b-b943-4fcf-935a-1cfc46d2a4ee	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832307/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nam%20form%20r%E1%BB%99ng%20c%E1%BB%95%20ch%E1%BB%AF%20V%20d%C3%A0i%20tay/variant/%C3%81o%20s%C6%A1%20mi%20nam%20form%20r%E1%BB%99ng%20c%E1%BB%95%20ch%E1%BB%AF%20V%20d%C3%A0i%20tay-%C3%81o%20s%C6%A1%20mi-Vintino-Tr%E1%BA%AFng/jrt5pywzffrs5nvqm5oh.webp	2025-11-23 00:25:01.008285	41e68c5c-c1a3-48bd-ac73-d71f3725fb58	\N
f5d8f35c-f14e-42eb-bc92-9b224ca7393c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832307/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nam%20form%20r%E1%BB%99ng%20c%E1%BB%95%20ch%E1%BB%AF%20V%20d%C3%A0i%20tay/variant/%C3%81o%20s%C6%A1%20mi%20nam%20form%20r%E1%BB%99ng%20c%E1%BB%95%20ch%E1%BB%AF%20V%20d%C3%A0i%20tay-%C3%81o%20s%C6%A1%20mi-Vintino-%C4%90en/shwoiimakyfc6hhdnxpj.webp	2025-11-23 00:25:01.008285	69044697-f24a-4e02-9d61-777681f6e610	\N
5408f59d-49a7-4569-94eb-f17bde3626b4	2796f05d-c729-48bd-983e-8e3d48923fe2	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832519/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/kx3xxawz4wtc03r5te37.webp	2025-11-23 00:28:35.78267	\N	\N
f9dd1ee8-5775-492f-98a7-87a5cfc7d099	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832520/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i-%C3%81o%20s%C6%A1%20mi-Vintino-Ghi/uyiohtvxdtbvblvljexx.webp	2025-11-23 00:28:35.78267	511abd0b-c6ea-45ea-b71d-99f3133d7b7d	\N
92c79c20-6f17-4ea9-b9a0-a56acdcb66dc	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832520/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i-%C3%81o%20s%C6%A1%20mi-Vintino-Xanh%20r%C3%AAu/uaiwms44ezntivngjrbx.webp	2025-11-23 00:28:35.78267	001dce9b-cdaa-487d-b3f5-13030b27f5e8	\N
f8f5a9e0-fdf8-45fd-8b10-09cb06acb648	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832522/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/variant/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i-%C3%81o%20s%C6%A1%20mi-Vintino-%C4%90%E1%BB%8F%20g%E1%BA%A1ch/ddpbnq1bhm6j4oj2cxv1.webp	2025-11-23 00:28:35.78267	1323d275-e643-483b-9f4d-1e5173639253	\N
a072c857-8a2e-4f3f-b639-24e6d338009e	90efd963-08cf-411e-a752-a9497f7eaaf1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832602/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20si%C3%AAu%20nh%E1%BA%B9/onlkrwsy7c28foms1e1g.webp	2025-11-23 00:29:57.359522	\N	\N
5c1ba472-e19d-4a75-92f1-68e4ae6319ac	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832603/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20si%C3%AAu%20nh%E1%BA%B9/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20si%C3%AAu%20nh%E1%BA%B9-Qu%E1%BA%A7n%20short-Lilywear-Xanh%20%C4%91%E1%BA%ADm/eovzzwdetn7ceddrt7tz.webp	2025-11-23 00:29:57.359522	f20cb87d-c720-4671-9d7e-a8059bdf8778	\N
e6fcef06-a03a-498c-a98c-dbb9b9b80317	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832603/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20si%C3%AAu%20nh%E1%BA%B9/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20si%C3%AAu%20nh%E1%BA%B9-Qu%E1%BA%A7n%20short-Lilywear-Xanh%20nh%E1%BA%A1t/f34q5ppsjixr1gbjnmul.webp	2025-11-23 00:29:57.359522	b3c97e6a-9179-4c9b-89d0-b178081e65b0	\N
2acb5ef2-3992-4dfb-b0f0-186abb828c35	ebfd2ebf-e4ae-459b-be4d-c559f275548d	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832699/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng/tzij3kdk9agh9kdm9wzj.webp	2025-11-23 00:31:35.57746	\N	\N
779e2923-085e-4b2b-9157-9461ba1caf9e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832700/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng/variant/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng-%C3%81o%20s%C6%A1%20mi-Vintino-%C4%90en/epc4jzviohypwt1zplbp.webp	2025-11-23 00:31:35.57746	5e4a5740-2d0c-498f-b1db-3497326b9bc2	\N
cfd17596-ff7d-4544-a9eb-783b00b67379	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832700/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng/variant/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng-%C3%81o%20s%C6%A1%20mi-Vintino-Ghi/yse8ehcmsaa7kmfkjxq0.webp	2025-11-23 00:31:35.57746	7fdd9e81-05aa-4e4b-bb3f-89e0330009df	\N
ed760c7e-eeb2-4ac7-a59c-9c6f3195756c	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832701/fashion_ecommerce/product/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng/variant/%C3%81o%20s%C6%A1%20mi%20nhung%20t%C4%83m%20form%20su%C3%B4ng-%C3%81o%20s%C6%A1%20mi-Vintino-Xanh%20trend/zqone3x2tunbukxyyk6c.webp	2025-11-23 00:31:35.57746	c09cefd1-5e61-413b-a0d5-97be049099d1	\N
5dc22d90-be17-4165-9901-0907169b7497	004ca463-3862-4b7b-93a6-41e41250ecb7	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832747/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit/ang1valxei4nijotwxsp.webp	2025-11-23 00:32:23.994276	\N	\N
7c0c2c50-deb6-4989-97ce-c420f285e6d3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832749/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit-Qu%E1%BA%A7n%20Jean-Coolmate-%C4%90en/khqlpwymeprd50103xdf.webp	2025-11-23 00:32:23.994276	14b618ed-f170-4d5d-8afd-88ebbdfb725f	\N
8a82bf4d-25a2-4efb-8369-ad9b7393d1f9	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832749/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit-Qu%E1%BA%A7n%20Jean-Coolmate-Xanh%20%C4%91%E1%BA%ADm/jek7kmitkkxxps6puq8m.webp	2025-11-23 00:32:23.994276	59d47bfa-c5cc-42ce-a5d6-b7c8a725d911	\N
255606e3-05c8-4502-94e7-6310a7814ddc	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832750/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20Basics%20d%C3%A1ng%20Slim%20fit-Qu%E1%BA%A7n%20Jean-Coolmate-%C4%90en%20wash/yyjcgxueqvddutvfbrru.webp	2025-11-23 00:32:23.994276	d4a9b595-8ad0-4489-88ab-1096432e9bc7	\N
84bef11e-ec5e-4d97-8560-36d89ea2ff80	3c323421-accb-4dd9-a288-aad9a577fe1f	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832896/fashion_ecommerce/product/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng/yfbiyw9qmqv0urvbp3yf.webp	2025-11-23 00:34:52.374476	\N	\N
b7cdddc9-36b0-4c7f-afd9-e35577802c6a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832897/fashion_ecommerce/product/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng/variant/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-%C4%90en/a0nhi4prsjmbxlymzolh.webp	2025-11-23 00:34:52.374476	04d15922-cf76-4c5d-b27d-ec11ca9d1e37	\N
bb732379-b45a-4170-990a-59e4b364663a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832897/fashion_ecommerce/product/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng/variant/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-Tr%E1%BA%AFng/gsc07bnf8osxolnhejeu.webp	2025-11-23 00:34:52.374476	e4e4da91-b32b-4539-98f8-4c2bd33e1624	\N
2269d738-1de1-41d1-a372-5feb6094c306	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832897/fashion_ecommerce/product/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng/variant/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-X%C3%A1m%20%C4%91%E1%BA%ADm/jzmkchnwmvtjzmpodbyy.webp	2025-11-23 00:34:52.374476	4083d369-2bcd-47e4-9fad-1c106124b4ba	\N
5cb4997f-0d54-4c57-975f-17417291414b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832898/fashion_ecommerce/product/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng/variant/Qu%C3%A2%CC%80n%20Da%CC%80i%20%C3%94%CC%81ng%20R%C3%B4%CC%A3ng%20Form%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-X%C3%A1m%20nh%E1%BA%A1t/fxxjchdylejw0eh7gzef.webp	2025-11-23 00:34:52.374476	800be56d-1c4a-47e2-b94b-3278c9c28bbc	\N
28cc93ee-c2c4-4ad6-b212-0665160e30d1	a91d7f6d-2c7a-4195-9a6f-09bf59bfe297	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832919/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Copper%20Denim%20OG%20Slim/xnpq8ohrz4oobvxhpffu.webp	2025-11-23 00:35:15.267421	\N	\N
081a4794-ec0c-41ff-8569-720177e0622e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832921/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Copper%20Denim%20OG%20Slim/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20Copper%20Denim%20OG%20Slim-Qu%E1%BA%A7n%20Jean-Coolmate-Xanh%20nh%E1%BA%A1t/tbwep2yqc0glnofwxvzy.webp	2025-11-23 00:35:15.267421	35cd4bf6-32da-48e8-9097-b230640eed52	\N
ee4c72ab-6c7d-4808-8ea0-657a73777052	56d7a427-f2f8-41f4-a6b3-b87ed794b8eb	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833009/fashion_ecommerce/product/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng/vm327jwcpw4pta7sl225.webp	2025-11-23 00:36:46.85999	\N	\N
70e403dd-b2eb-47ee-80b2-0acc57f72749	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833010/fashion_ecommerce/product/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-%C4%90en/ubwnjrwwtozn7elii8u0.webp	2025-11-23 00:36:46.85999	559a743b-f0bc-4797-9b3d-3abb89585960	\N
da01a61f-5bc6-4495-9454-06dc509b7902	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833011/fashion_ecommerce/product/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-Xanh/ktyuqxuek7u3ixcbmtc9.webp	2025-11-23 00:36:46.85999	d08e1ecf-a7a3-4032-9ad0-94c766c7ec45	\N
a633cbaf-c147-4e4d-8480-fd3715517270	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833011/fashion_ecommerce/product/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng/variant/Qu%E1%BA%A9n%20K%E1%BA%BB%20Caro%20%E1%BB%90ng%20R%E1%BB%99ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-N%C3%A2u/eliptu3p3trtiaptqiyt.webp	2025-11-23 00:36:46.85999	752b8b1a-d9e3-44b1-b544-7b8b3826bfbd	\N
94905762-565a-40f3-a1c2-902d4d019478	b498eac7-3002-41e0-bbe6-f0c7763bee25	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833141/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Denim%20Slim%20Fit/nnjoj7y1u8k4j8zsfpdf.webp	2025-11-23 00:38:56.081344	\N	\N
9af9155f-54b2-4dbc-b7f3-d32bf616ecfa	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833142/fashion_ecommerce/product/Qu%E1%BA%A7n%20Jeans%20Nam%20Denim%20Slim%20Fit/variant/Qu%E1%BA%A7n%20Jeans%20Nam%20Denim%20Slim%20Fit-Qu%E1%BA%A7n%20Jean-Coolmate-Xanh%20nh%E1%BA%A1t/vcnz4bhe2cb9xpxljvm7.webp	2025-11-23 00:38:56.081344	96a74a2d-6cdc-43b2-9cdc-6125f611d3d4	\N
58a5c315-7b5f-44a5-bb73-0c695287998e	226b4097-287d-4610-897a-3e641f477af5	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833285/fashion_ecommerce/product/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng/nmmn03rz18m8e3ln1ose.webp	2025-11-23 00:41:20.722408	\N	\N
e515bb2b-409d-468a-a1a6-1ee15b9864b3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833286/fashion_ecommerce/product/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng/variant/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-%C4%90en/bfqpiciwmxjyclzbj8zs.webp	2025-11-23 00:41:20.722408	95d20cfb-1000-434a-8519-2e3b11c52c0a	\N
622c8097-f4d6-4aa6-b6c3-54b3135cef93	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833286/fashion_ecommerce/product/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng/variant/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-Tr%E1%BA%AFng/x5uvnsfktgensxwlnnxn.webp	2025-11-23 00:41:20.722408	67a975fe-6fa4-42c5-86fc-12c59c8caae4	\N
a842208c-cc1d-4a90-9b6f-79940263f304	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833286/fashion_ecommerce/product/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng/variant/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-Be/ae3vrylylqqxe36xtbuw.webp	2025-11-23 00:41:20.722408	ddba209c-17a5-458b-90e1-c5a0c1c16aec	\N
48d970e0-f418-4e3e-94e1-7656929a4954	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833286/fashion_ecommerce/product/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng/variant/Qu%E1%BA%A7n%20D%C3%A0i%20Baggy%20Kaki%20%E1%BB%90ng%20Su%C3%B4ng-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-Xanh%20r%C3%AAu/rf0mbhwz4lzvj8zwmmih.webp	2025-11-23 00:41:20.722408	cb96ae57-1335-4060-8d29-e4c045e7fdfe	\N
d4730ea6-ca03-41d7-bb74-8d14598a5e85	ef0c3952-509c-4f61-8bcb-7f7b8d860ca9	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833441/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao/uecksjfdo0toa11cyv65.webp	2025-11-23 00:43:56.515619	\N	\N
a15cca66-bd45-4f39-8ac3-1f8ca03dcdf7	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833442/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-%C4%90en/dvbw1gz5diov6mhbjkjs.webp	2025-11-23 00:43:56.515619	45c37b02-43e9-437a-8946-ccc6602d91ca	\N
2bcefbd0-f582-4a70-a24b-9d1cad97e80b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833442/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-Tr%E1%BA%AFng/nsixx34gw1n8i81a4jcr.webp	2025-11-23 00:43:56.515619	552ee7f7-5b89-470b-b99c-8a993e0330c7	\N
7bbc0d05-7b90-481b-9cc5-9d8c5e2e6afd	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833442/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-X%C3%A1m%20%C4%91%E1%BA%ADm/mgz91ghci4lvwp0roajr.webp	2025-11-23 00:43:56.515619	ae8a9c37-037d-4bc6-b3b6-ebece2e75794	\N
1b14da87-d7d1-48b6-b87d-2b088404bd2a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833442/fashion_ecommerce/product/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao/variant/Qu%E1%BA%A7n%20N%E1%BB%89%20Nam%20%E1%BB%90ng%20Su%C3%B4ng%20R%E1%BB%99ng%20Th%E1%BB%83%20Thao-Qu%E1%BA%A7n%20%E1%BB%91ng%20r%E1%BB%99ng-Vintino-X%C3%A1m%20nh%E1%BA%A1t/fezmwzpf8lflubgcj99b.webp	2025-11-23 00:43:56.515619	148041b9-e87e-46d5-840f-ba187bf82a7f	\N
f89bfc48-694d-4875-a455-bce916f078f2	3414bfb8-ec3b-46c6-95ea-445567e05e72	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833735/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn/dedytcnegnfxywgufh4q.webp	2025-11-23 00:48:51.617926	\N	\N
8e9e3f6b-a7d6-4d6b-af0c-963e20058f6a	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833736/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn-V%C3%AD%20n%E1%BB%AF-SEEME-%C4%90en/qsvka0gzhdj5fa1fvvvt.webp	2025-11-23 00:48:51.617926	52308c2f-1727-4a13-9e07-c4c7dbe021b6	\N
316d1003-f86e-422e-a4dd-54c88105e59b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833736/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn-V%C3%AD%20n%E1%BB%AF-SEEME-Kem/wnshqb1hguc2uzsxn3xj.webp	2025-11-23 00:48:51.617926	43bb1977-85ac-4879-9ccf-330cf13c78d5	\N
b2fe46e9-a9f9-480c-9cdc-59aec5ba2d37	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833737/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20d%C3%A1ng%20ng%E1%BA%AFn-V%C3%AD%20n%E1%BB%AF-SEEME-Jeans/vqik86m0fcfggq67khih.webp	2025-11-23 00:48:51.617926	6fd1ee6d-ff9b-4055-bcbb-c44bc80e0b6f	\N
bdeec3a5-3fa8-4bab-a3e5-015fc20e428b	3bd8a250-7654-4f7b-9a80-6fc050a67a3b	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833877/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i/eukxchkmhzjp9hpinlok.webp	2025-11-23 00:51:12.806888	\N	\N
fb035d44-6ea5-47c5-8b83-ac3178bd6353	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833878/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i/variant/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i-V%C3%AD%20n%E1%BB%AF-SEEME-%C4%90en/s0xsk5kovyfgvyfdi9jm.webp	2025-11-23 00:51:12.806888	93a992a4-2a3e-44f8-9063-3707a0c640c4	\N
7bb9a73a-1a30-4130-8df7-1c2cbd5441a1	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833878/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i/variant/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i-V%C3%AD%20n%E1%BB%AF-SEEME-Kem/nfcvd3qoxk9zzoqzbmdd.webp	2025-11-23 00:51:12.806888	1a7f4e0a-0a39-49a2-b723-12cd0bb1ebb1	\N
d6dbabed-c561-4ebb-89bc-dda93a4a306e	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833878/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i/variant/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i-V%C3%AD%20n%E1%BB%AF-SEEME-Jeans/e0muiffrsvxcv75ifdhf.webp	2025-11-23 00:51:12.806888	b8013dc4-41d9-4b05-9431-69fec87f4939	\N
f35b427b-aaec-40fc-862b-c533e207e684	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833879/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i/variant/V%C3%AD%20n%E1%BB%AF%20ch%E1%BA%A7n%20g%E1%BA%ADp%20%C4%91%C3%B4i-V%C3%AD%20n%E1%BB%AF-SEEME-B%E1%BA%A1c/ji4wrk9cpvxfotv4rbn5.webp	2025-11-23 00:51:12.806888	3e6050b4-9993-4737-840a-6d632d98ff5e	\N
a0924e18-4ca5-41ae-9d00-625c5e935d31	47af250b-ee4a-4bb5-800a-b0ff439492ad	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834057/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba/a2ab7i3qmwq5h1c05hrg.webp	2025-11-23 00:54:13.035076	\N	\N
e94ebca1-1965-4f04-a51e-ee3a73da5eb3	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834058/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba-V%C3%AD%20n%E1%BB%AF-SEEME-H%E1%BB%93ng/gsngmlj0k3ff1jbhncd9.webp	2025-11-23 00:54:13.035076	de0a4a43-bec4-47d6-a27d-46f86237bf72	\N
4af4ccaa-9664-43e0-a100-94bead82beaa	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834058/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba-V%C3%AD%20n%E1%BB%AF-SEEME-%C4%90en/xripajrtaapant4kubq6.webp	2025-11-23 00:54:13.035076	de81c708-e3dd-4492-9a2f-49e3c3fb1296	\N
1df78a51-e7f1-4ce4-b2c4-84797562c0a7	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834058/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba-V%C3%AD%20n%E1%BB%AF-SEEME-Be/h5fuzpsfggyxoiabtzag.webp	2025-11-23 00:54:13.035076	b893d9ff-bb80-4dc2-afae-183cebde1105	\N
2dc6d472-492c-462b-b4bc-9cb5c560d404	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834058/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba-V%C3%AD%20n%E1%BB%AF-SEEME-Jeans/fzebtlzjh3ovjcbis5qy.webp	2025-11-23 00:54:13.035076	f8829a68-e5f8-46e5-b824-96b9950376e1	\N
8fa0813c-3a2f-457a-9257-53cab7b74692	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834059/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20mini%20g%E1%BA%ADp%20ba-V%C3%AD%20n%E1%BB%AF-SEEME-V%C3%A0ng/qp4gmxpx3vgrlbipmmv7.webp	2025-11-23 00:54:13.035076	b2e116b8-1426-4af4-ba08-b5631daeaf2b	\N
b0e132d6-6fb0-4fb6-9d17-b762f1268347	16fac00e-9179-4156-8df3-2524f85512cf	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834155/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt/qpejnalh0smo1nuzlyjw.webp	2025-11-23 00:55:49.769315	\N	\N
b4da247f-64e3-4b42-bf25-5a6ba02a15e2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834156/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt-V%C3%AD%20n%E1%BB%AF-SEEME-%C4%90en/jz7yheehdfetc084gzlu.webp	2025-11-23 00:55:49.769315	d1617ec5-f9c1-4616-95b2-9869b8af6ceb	\N
3a935c05-af0c-4105-ac65-4a59d24ba41b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834156/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt-V%C3%AD%20n%E1%BB%AF-SEEME-Be/bjihmpxqqwqvxhp9x6os.webp	2025-11-23 00:55:49.769315	a054a5c2-50a9-4ae3-a3c1-1ef95a1a7565	\N
786e0493-a367-45d6-94cc-c8b76a6048c2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834156/fashion_ecommerce/product/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt/variant/V%C3%AD%20%C4%91%E1%BB%B1ng%20ti%E1%BB%81n%20n%E1%BB%AF%20c%E1%BA%A7m%20tay%20h%C3%ACnh%20ch%E1%BB%AF%20nh%E1%BA%ADt-V%C3%AD%20n%E1%BB%AF-SEEME-Jeans/iwm7wqomjkwm36y4zkvb.webp	2025-11-23 00:55:49.769315	7bfbb38a-6b74-45e3-b56d-595dcbcd3d8d	\N
0815b438-a978-4d88-85c4-fa79d60a4767	bb585dc8-9dc7-42cc-a532-ac4d1c092a9a	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834273/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20%C4%91%C3%ADnh%20%C4%91%C3%A1%20%C4%91eo%20ch%C3%A9o/tajrg0mtxtyqymkcnvoe.webp	2025-11-23 00:57:48.192003	\N	\N
5e5ba722-6cd2-46c3-be65-6e5bbda2be52	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834274/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20%C4%91%C3%ADnh%20%C4%91%C3%A1%20%C4%91eo%20ch%C3%A9o/variant/V%C3%AD%20n%E1%BB%AF%20mini%20%C4%91%C3%ADnh%20%C4%91%C3%A1%20%C4%91eo%20ch%C3%A9o-V%C3%AD%20n%E1%BB%AF-SEEME-%C4%90en/vtzwlq5iu5tvxyebxlaz.webp	2025-11-23 00:57:48.192003	7edfe531-3741-485a-94ed-50c595d36bd2	\N
0cd4fe2b-4e1d-4e54-80ce-7468d159ed22	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834274/fashion_ecommerce/product/V%C3%AD%20n%E1%BB%AF%20mini%20%C4%91%C3%ADnh%20%C4%91%C3%A1%20%C4%91eo%20ch%C3%A9o/variant/V%C3%AD%20n%E1%BB%AF%20mini%20%C4%91%C3%ADnh%20%C4%91%C3%A1%20%C4%91eo%20ch%C3%A9o-V%C3%AD%20n%E1%BB%AF-SEEME-Be/uik6dmjpvt4ku0c1vccg.webp	2025-11-23 00:57:48.192003	d55269c8-375d-4052-afa8-ea733436e67b	\N
726a26e6-86f4-408d-8ca8-11fca0fc3e35	a293c53b-0d41-4fa9-a158-49a13295d5c1	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834439/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch/jhljqmczhqc5odys6csd.webp	2025-11-23 01:00:35.297237	\N	\N
522f9d4e-63ba-40b6-9e78-60e2a7f34d36	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834440/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch-T%C3%BAi%20x%C3%A1ch-SEEME-Be/n8n9gyyksmpdnoa6j1ge.webp	2025-11-23 01:00:35.297237	55ba0325-1483-49ab-a8fd-755d821bd98c	\N
3a2d3232-d3f1-49ac-a7d6-56d542235747	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834440/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch-T%C3%BAi%20x%C3%A1ch-SEEME-N%C3%A2u/fzbf1x5qa0k2ebw9w0pw.webp	2025-11-23 01:00:35.297237	8042006c-5c33-43e7-9e96-45ad1429c69c	\N
0e6fc513-8114-4086-a18f-c78e9fe7c34b	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834440/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20n%E1%BB%AF%20cao%20c%E1%BA%A5p%20ph%E1%BB%91i%20x%C3%ADch-T%C3%BAi%20x%C3%A1ch-SEEME-Jeans/bhkokpgtnfbd17tpoc3m.webp	2025-11-23 01:00:35.297237	88c8ec46-8525-4d39-b74f-6e839d970d59	\N
9efe8df9-c94b-4c46-833f-10af8a268433	bcfed53f-a779-466d-94e9-b631b4617993	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834571/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n/p9ckmtiet9yt5jwnbsei.webp	2025-11-23 01:02:46.833306	\N	\N
8f55db85-2930-46c8-a199-104ee6320d80	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834572/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n-T%C3%BAi%20x%C3%A1ch-SEEME-%C4%90en/uc4gv0ridof4thxmjcjw.webp	2025-11-23 01:02:46.833306	83605c0c-17b5-4882-b040-7fe0d40aafef	\N
096fffe9-8673-4a66-a303-0bfe2a4ad095	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834572/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n-T%C3%BAi%20x%C3%A1ch-SEEME-Be/eztol6btj6jhuryt1cdc.webp	2025-11-23 01:02:46.833306	f83360c3-4655-4134-84d0-586ef60edc3c	\N
41e671b3-40a0-4027-afee-9299c16ccedb	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834572/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20da%20ch%E1%BA%A7n-T%C3%BAi%20x%C3%A1ch-SEEME-B%E1%BA%A1c/cx0wap9kiyy1ftbvcufj.webp	2025-11-23 01:02:46.833306	e42b2a4b-0d18-41cc-8f0e-4a1d585db23d	\N
0a37c576-e96e-43fb-af72-b68f6cea1787	bcc9da9b-b798-4636-b48f-5af85cb8381e	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834674/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20cao%20c%E1%BA%A5p/xh1t4ptvcfajfgmjdafk.webp	2025-11-23 01:04:28.525169	\N	\N
eb39cc7c-9580-4d44-bf22-a45f478355a4	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834674/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20cao%20c%E1%BA%A5p/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20cao%20c%E1%BA%A5p-T%C3%BAi%20x%C3%A1ch-SEEME-Be/krc8gd0xhxye8l61snk8.webp	2025-11-23 01:04:28.525169	6380b6ac-5437-4ee0-9612-2744973279e1	\N
51c2ceec-ca77-40a3-896a-9b1815cf1e12	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834674/fashion_ecommerce/product/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20cao%20c%E1%BA%A5p/variant/T%C3%BAi%20k%E1%BA%B9p%20n%C3%A1ch%20%C4%91eo%20ch%C3%A9o%20n%E1%BB%AF%20cao%20c%E1%BA%A5p-T%C3%BAi%20x%C3%A1ch-SEEME-Jeans/s2dkmyikpg16or2idfyh.webp	2025-11-23 01:04:28.525169	bc29bd4e-09f3-4ee8-afa8-0855e115c2c2	\N
44260185-674d-4e9a-ae6b-54b7bece54b1	06e25602-2755-4509-a9ad-bd5d50417304	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834741/fashion_ecommerce/product/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20%C4%91eo%20ch%C3%A9o%20d%C3%A2y%20x%C3%ADch%20da%20s%E1%BA%A7n/gaoskl7sm94b5g80x25s.webp	2025-11-23 01:05:36.061373	\N	\N
0ce38f22-5fc0-4ba7-bda4-93fb8fb6c5f2	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834742/fashion_ecommerce/product/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20%C4%91eo%20ch%C3%A9o%20d%C3%A2y%20x%C3%ADch%20da%20s%E1%BA%A7n/variant/T%C3%BAi%20x%C3%A1ch%20n%E1%BB%AF%20%C4%91eo%20ch%C3%A9o%20d%C3%A2y%20x%C3%ADch%20da%20s%E1%BA%A7n-T%C3%BAi%20x%C3%A1ch-SEEME-%C4%90en/u4ddluw3zcje6indn89f.webp	2025-11-23 01:05:36.061373	17704818-84e8-4b26-a3a4-cb5015d8ab5d	\N
195febd9-6d5c-48c3-aaf5-2dfdceec8a1f	242937f2-bccf-4371-a328-529b29be7fa9	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834817/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20ch%C3%A9o%20phong%20c%C3%A1ch%20H%C3%A0n%20Qu%E1%BB%91c%20ph%E1%BB%91i%20kho%C3%A1%20v%C3%A0ng/fbmdteysk3gjsrpc9j62.webp	2025-11-23 01:06:51.794979	\N	\N
05b35209-391a-41e5-b076-6f62299c70d5	\N	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763834818/fashion_ecommerce/product/T%C3%BAi%20%C4%91eo%20ch%C3%A9o%20phong%20c%C3%A1ch%20H%C3%A0n%20Qu%E1%BB%91c%20ph%E1%BB%91i%20kho%C3%A1%20v%C3%A0ng/variant/T%C3%BAi%20%C4%91eo%20ch%C3%A9o%20phong%20c%C3%A1ch%20H%C3%A0n%20Qu%E1%BB%91c%20ph%E1%BB%91i%20kho%C3%A1%20v%C3%A0ng-T%C3%BAi%20x%C3%A1ch-SEEME-%C4%90en/s7vjqy3gs0kxprvdg0z3.webp	2025-11-23 01:06:51.794979	8098b9d9-5763-4818-b4e5-2692fad5738c	\N
\.


--
-- TOC entry 5352 (class 0 OID 17341)
-- Dependencies: 289
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_variants (id, product_id, sku, color_name, sizes, stock_qty, created_at, updated_at, color_code, sold_qty) FROM stdin;
218141e5-6166-403c-94ba-a3b35ac7d57c	508ad9d2-9ba1-40fe-83b7-88d6a829a6bb	Áo Sweater Nam Phối Sơ Mi-Áo thun-Zonef-Xám trắng	Xám trắng	["M", "L", "XL", "XXL"]	100	2025-11-21 20:22:17.536819	2025-11-21 20:22:17.536819	#F2EDF1	0
5a050f58-c757-4bda-a00a-a29e5e34ca3a	508ad9d2-9ba1-40fe-83b7-88d6a829a6bb	Áo Sweater Nam Phối Sơ Mi-Áo thun-Zonef-Xám tiêu	Xám tiêu	["M", "L", "XL", "XXL"]	100	2025-11-21 20:22:17.536819	2025-11-21 20:22:17.536819	#D6D6D8	0
7b43ae03-c2ee-464b-ae62-e0b0a22d6bff	508ad9d2-9ba1-40fe-83b7-88d6a829a6bb	Áo Sweater Nam Phối Sơ Mi-Áo thun-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 20:22:17.536819	2025-11-21 20:22:17.536819	#000000	0
03b38702-a5f0-4211-8b69-48c7c70aad2f	ed97bb82-d6f9-4100-9d97-9fd3e5130808	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize-Áo sơ mi-Zonef-Trắng	Trắng	["M", "L", "XL", "XXL"]	50	2025-11-21 21:14:18.816246	2025-11-21 21:14:18.816246	#ffffff	0
dd6c971d-fc45-4f48-b6ad-0616a95fb9a3	ed97bb82-d6f9-4100-9d97-9fd3e5130808	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize-Áo sơ mi-Zonef-Xanh ghi	Xanh ghi	["M", "L", "XL", "XXL"]	50	2025-11-21 21:14:18.816246	2025-11-21 21:14:18.816246	#B9D0E3	0
534c96a5-06e0-4e08-b064-5a1d57b69e3d	ed97bb82-d6f9-4100-9d97-9fd3e5130808	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize-Áo sơ mi-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	50	2025-11-21 21:14:18.816246	2025-11-21 21:14:18.816246	#000000	0
cba46ffa-2111-446b-bc1c-a6caa8791f3e	39e16012-3a4b-4991-b6e1-86ea9e27f7d1	Áo hoodie ninja cao cổ Ver 2-Áo Hoodie-Zonef-Xám	Xám	["M", "L", "XL"]	102	2025-11-21 21:18:50.394407	2025-11-21 21:18:50.394407	#80818C	0
7d751d4d-b43d-43bb-b29c-c9a55316a922	1ef6a49e-4a10-446f-a60a-fd2307a5423d	Áo Thun Trơn Phối Vạt Trước-Áo thun-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:24:08.319717	2025-11-21 21:24:08.319717	#000000	0
a5718bd2-99d1-4228-9540-cfe2aa022dd3	1ef6a49e-4a10-446f-a60a-fd2307a5423d	Áo Thun Trơn Phối Vạt Trước-Áo thun-Zonef-Trắng	Trắng	["M", "L", "XL", "XXL"]	100	2025-11-21 21:24:08.319717	2025-11-21 21:24:08.319717	#ffffff	0
32a86374-044a-4373-84d9-bf7354fbd6d4	1ef6a49e-4a10-446f-a60a-fd2307a5423d	Áo Thun Trơn Phối Vạt Trước-Áo thun-Zonef-Đỏ đô	Đỏ đô	["M", "L", "XL", "XXL"]	99	2025-11-21 21:24:08.319717	2025-11-21 21:24:08.319717	#6B222C	0
7a2d6aba-3721-40de-9549-4888ebac2ebe	ca60a8d3-00d8-4125-92ca-3f5219959851	Áo Thun Sweater Dài Tay Form Rộng Unisex-Áo thun-Zonef-Kem kẻ đen	Kem kẻ đen	["M", "L", "XL"]	100	2025-11-21 21:27:09.13702	2025-11-21 21:27:09.13702	#ffffff	0
5de98951-3639-42b2-a9f4-c06eec6c30a1	ca60a8d3-00d8-4125-92ca-3f5219959851	Áo Thun Sweater Dài Tay Form Rộng Unisex-Áo thun-Zonef-Đen kẻ trắng	Đen kẻ trắng	["M", "L", "XL"]	100	2025-11-21 21:27:09.13702	2025-11-21 21:27:09.13702	#000000	0
a782f0d9-f0b2-4efe-ae69-2c35e44285a7	57fc66fe-d83a-41d6-9800-5c7a1541d4ab	Quần Nỉ Ống Cong Phối Dây Thừng-Quần ống rộng-Zonef-Xám trắng	Xám trắng	["M", "L", "XL", "XXL"]	100	2025-11-21 21:33:23.841721	2025-11-21 21:33:23.841721	#CAC6CC	0
2b5ea2c1-5465-47b3-9398-7b256e173bd4	57fc66fe-d83a-41d6-9800-5c7a1541d4ab	Quần Nỉ Ống Cong Phối Dây Thừng-Quần ống rộng-Zonef-Xám tiêu	Xám tiêu	["M", "L", "XL", "XXL"]	100	2025-11-21 21:33:23.841721	2025-11-21 21:33:23.841721	#CAC6CC	0
94dc42de-76eb-414f-8fdb-fd515af79c06	57fc66fe-d83a-41d6-9800-5c7a1541d4ab	Quần Nỉ Ống Cong Phối Dây Thừng-Quần ống rộng-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:33:23.841721	2025-11-21 21:33:23.841721	#000000	0
f5eff02a-7be4-4164-a2a6-1449cdf4fa8b	57fc66fe-d83a-41d6-9800-5c7a1541d4ab	Quần Nỉ Ống Cong Phối Dây Thừng-Quần ống rộng-Zonef-Nâu	Nâu	["M", "L", "XL", "XXL"]	100	2025-11-21 21:33:23.841721	2025-11-21 21:33:23.841721	#4B392D	0
36ef4013-9718-400c-86c1-af71d27ad030	5e8b15d6-2a08-4acd-a57a-3ccc364973c1	Quần Vải Kaki Dù Xếp Ly Ống Rộng-Quần ống rộng-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:41:31.818654	2025-11-21 21:41:31.818654	#000000	0
b506fbd2-88ac-4ffb-a983-2973466c3a9f	5e8b15d6-2a08-4acd-a57a-3ccc364973c1	Quần Vải Kaki Dù Xếp Ly Ống Rộng-Quần ống rộng-Zonef-Xanh rêu	Xanh rêu	["M", "L", "XL", "XXL"]	100	2025-11-21 21:41:31.818654	2025-11-21 21:41:31.818654	#5B5D37	0
4dd74f1d-0fb2-4b16-87ac-fdf9ca97b2c5	5e8b15d6-2a08-4acd-a57a-3ccc364973c1	Quần Vải Kaki Dù Xếp Ly Ống Rộng-Quần ống rộng-Zonef-Kem	Kem	["M", "L", "XL", "XXL"]	100	2025-11-21 21:41:31.818654	2025-11-21 21:41:31.818654	#DBD5C6	0
a62733bf-22fa-4b45-90ae-187573c47cc0	5e8b15d6-2a08-4acd-a57a-3ccc364973c1	Quần Vải Kaki Dù Xếp Ly Ống Rộng-Quần ống rộng-Zonef-Nâu	Nâu	["M", "L", "XL", "XXL"]	100	2025-11-21 21:41:31.818654	2025-11-21 21:41:31.818654	#B0865F	0
140c718b-feff-4f67-9d64-90a2a7909958	5e8b15d6-2a08-4acd-a57a-3ccc364973c1	Quần Vải Kaki Dù Xếp Ly Ống Rộng-Quần ống rộng-Zonef-Ghi	Ghi	["M", "L", "XL", "XXL"]	100	2025-11-21 21:41:31.818654	2025-11-21 21:41:31.818654	#5C5C5C	0
95d92259-b184-437a-b185-c534e80ac243	5d1b2d2b-a691-475e-94bb-17e92f9f2c60	Quần Jean Nam Loang Rách-Quần Jean-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:46:43.490298	2025-11-21 21:46:43.490298	#000000	0
4b677ff5-9ca5-443e-b8e2-0d3cb45cc0d1	5d1b2d2b-a691-475e-94bb-17e92f9f2c60	Quần Jean Nam Loang Rách-Quần Jean-Zonef-Xanh nhạt	Xanh nhạt	["M", "L", "XL", "XXL"]	100	2025-11-21 21:46:43.490298	2025-11-21 21:46:43.490298	#B1B4B1	0
7f0ece59-bfea-4755-a32b-e2ba35100521	5d1b2d2b-a691-475e-94bb-17e92f9f2c60	Quần Jean Nam Loang Rách-Quần Jean-Zonef-Xanh đen	Xanh đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:46:43.490298	2025-11-21 21:46:43.490298	#373B47	0
db306fe0-3e06-45eb-a042-1bc537b64c42	88f9f1e2-dfa6-4119-9c79-f64e04dba2d5	Quần Jean Nam Suông Ống Rộng-Quần Jean-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:50:40.281175	2025-11-21 21:50:40.281175	#000000	0
4352246a-0ce1-4640-ac6a-43a4c314ffb0	88f9f1e2-dfa6-4119-9c79-f64e04dba2d5	Quần Jean Nam Suông Ống Rộng-Quần Jean-Zonef-Xanh	Xanh	["M", "L", "XL", "XXL"]	100	2025-11-21 21:50:40.281175	2025-11-21 21:50:40.281175	#48688F	0
10a790c1-b2e2-41f7-993d-b84881d78c9e	88f9f1e2-dfa6-4119-9c79-f64e04dba2d5	Quần Jean Nam Suông Ống Rộng-Quần Jean-Zonef-Xám	Xám	["M", "L", "XL", "XXL"]	100	2025-11-21 21:50:40.281175	2025-11-21 21:50:40.281175	#656264	0
f67e56e9-968d-4ee2-86a1-536cdd3aa8d5	e195f30f-180a-4ca1-9cd3-aed5b35f7889	Quần Ống Rộng Cạp Chun Nam vải Tuyết Mưa-Quần Âu-Zonef-Đen	Đen	["M", "L", "XL", "XXL"]	100	2025-11-21 21:55:03.188831	2025-11-21 21:55:03.188831	#000000	0
0c01bf7a-8413-418a-8bf3-c6775c6a3d6e	e195f30f-180a-4ca1-9cd3-aed5b35f7889	Quần Ống Rộng Cạp Chun Nam vải Tuyết Mưa-Quần Âu-Zonef-Ghi	Ghi	["M", "L", "XL", "XXL"]	100	2025-11-21 21:55:03.188831	2025-11-21 21:55:03.188831	#50535A	0
44bf075a-7455-4acd-bfc1-a1894caba220	e195f30f-180a-4ca1-9cd3-aed5b35f7889	Quần Ống Rộng Cạp Chun Nam vải Tuyết Mưa-Quần Âu-Zonef-Kem	Kem	["M", "L", "XL", "XXL"]	100	2025-11-21 21:55:03.188831	2025-11-21 21:55:03.188831	#ECEDE8	0
fecdf009-7a7a-464c-8035-f0a040e8c17a	e195f30f-180a-4ca1-9cd3-aed5b35f7889	Quần Ống Rộng Cạp Chun Nam vải Tuyết Mưa-Quần Âu-Zonef-Nâu	Nâu	["M", "L", "XL", "XXL"]	100	2025-11-21 21:55:03.188831	2025-11-21 21:55:03.188831	#806655	0
25d47ced-db5b-4bd5-97a9-7e8f893818b9	b486bb46-094f-4e92-9543-fb12aaa640fc	Túi Đeo Vai Nữ Quai Xích Lea Chain HAPAS-Túi đeo chéo-Hapas-Xám xanh	Xám xanh	["KHÁC"]	100	2025-11-21 22:01:51.62576	2025-11-21 22:01:51.62576	#C6CED3	0
8f0c31f4-4c3c-4403-ba19-1b78d0d9cead	b486bb46-094f-4e92-9543-fb12aaa640fc	Túi Đeo Vai Nữ Quai Xích Lea Chain HAPAS-Túi đeo chéo-Hapas-Đen	Đen	["KHÁC"]	100	2025-11-21 22:01:51.62576	2025-11-21 22:01:51.62576	#000000	0
b434644d-8f2c-433d-8271-eee1ec576ada	b486bb46-094f-4e92-9543-fb12aaa640fc	Túi Đeo Vai Nữ Quai Xích Lea Chain HAPAS-Túi đeo chéo-Hapas-Kem	Kem	["KHÁC"]	100	2025-11-21 22:01:51.62576	2025-11-21 22:01:51.62576	#EBE1D9	0
1e32c8a7-572b-4de2-b865-823f80ae4353	b93e9113-141c-46fd-b95e-36bf16e69391	Túi Xách Nữ Hobo Đáy Vuông-Túi xách-Hapas-Jean	Jean	["KHÁC"]	1	2025-11-21 22:11:14.051333	2025-11-21 22:11:14.051333	#668193	0
866006fe-d155-40a0-82b5-4a801e349dd8	b93e9113-141c-46fd-b95e-36bf16e69391	Túi Xách Nữ Hobo Đáy Vuông-Túi xách-Hapas-Kem	Kem	["KHÁC"]	100	2025-11-21 22:11:14.051333	2025-11-21 22:11:14.051333	#E7D8BB	0
f0e2f3ee-ec9e-4c00-a5c6-9ccbd4ce2468	b93e9113-141c-46fd-b95e-36bf16e69391	Túi Xách Nữ Hobo Đáy Vuông-Túi xách-Hapas-Đen	Đen	["KHÁC"]	100	2025-11-21 22:11:14.051333	2025-11-21 22:11:14.051333	#000000	0
682c0866-ad3d-4d12-9a6b-96e2fc89b037	882f88a5-9a17-4218-a4d8-ade7667c088a	Túi Đeo Vai Hobo Nắp Gập-Túi đeo chéo-Hapas-Kem	Kem	["KHÁC"]	100	2025-11-21 22:16:29.907234	2025-11-21 22:16:29.907234	#EBE6DA	0
d959df69-4c54-4a9b-b7ae-61def14a5faf	882f88a5-9a17-4218-a4d8-ade7667c088a	Túi Đeo Vai Hobo Nắp Gập-Túi đeo chéo-Hapas-Đen	Đen	["KHÁC"]	100	2025-11-21 22:16:29.907234	2025-11-21 22:16:29.907234	#000000	0
9a26596c-fe14-4a9c-8bf2-5a3fa00ba4fa	ed97bb82-d6f9-4100-9d97-9fd3e5130808	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize-Áo sơ mi-Zonef-xanh cốm	xanh cốm	["M", "L", "XL", "XXL"]	42	2025-11-21 21:14:18.816246	2025-11-25 15:56:44.259117	#C6DACF	8
58837136-3d17-4961-9f8e-43e8ac517ad8	882f88a5-9a17-4218-a4d8-ade7667c088a	Túi Đeo Vai Hobo Nắp Gập-Túi đeo chéo-Hapas-Bạc	Bạc	["KHÁC"]	100	2025-11-21 22:16:29.907234	2025-11-21 22:16:29.907234	#D7D7D5	0
b65d96ff-174b-4533-bc76-048447543fa0	0da4fd99-5be0-4172-8a21-7d3bd9e9c28f	Túi Xách Nữ Công Sở Cao Cấp-Túi xách-Hapas-Đen	Đen	["KHÁC"]	100	2025-11-21 22:20:40.996372	2025-11-21 22:20:40.996372	#000000	0
1508868b-fe97-46ea-a924-cc855367d645	0da4fd99-5be0-4172-8a21-7d3bd9e9c28f	Túi Xách Nữ Công Sở Cao Cấp-Túi xách-Hapas-Trắng	Trắng	["KHÁC"]	100	2025-11-21 22:20:40.996372	2025-11-21 22:20:40.996372	#ffffff	0
32c4b074-7c87-4eba-ae3a-f5d51211ab81	c271b54d-5da5-4738-9ffa-1d20995feee5	Bộ Quà Tặng Tidy-Set quà tặng-Hapas-Kem	Kem	["KHÁC"]	100	2025-11-21 22:27:17.141331	2025-11-21 22:27:17.141331	#EEECE7	0
f4ad4811-12c1-4d6b-96e1-f60be655664f	c271b54d-5da5-4738-9ffa-1d20995feee5	Bộ Quà Tặng Tidy-Set quà tặng-Hapas-Xanh ghi	Xanh ghi	["KHÁC"]	100	2025-11-21 22:27:17.141331	2025-11-21 22:27:17.141331	#B6C0CA	0
2c09e2de-0082-4dd6-b119-0a9bf1698a74	c271b54d-5da5-4738-9ffa-1d20995feee5	Bộ Quà Tặng Tidy-Set quà tặng-Hapas-Đen	Đen	["KHÁC"]	100	2025-11-21 22:27:17.141331	2025-11-21 22:27:17.141331	#000000	0
73de87c5-571e-4123-8e21-878035a3e88a	c271b54d-5da5-4738-9ffa-1d20995feee5	Bộ Quà Tặng Tidy-Set quà tặng-Hapas-Nâu	Nâu	["KHÁC"]	100	2025-11-21 22:27:17.141331	2025-11-21 22:27:17.141331	#271A19	0
b6b63c6b-887b-422e-bdec-c94b88d529c6	7885e516-1b25-4f4f-a446-c079b57f7841	Bộ Quà Tặng Túi Xách "Yêu Chiều"-Set quà tặng-Hapas-Kem sang trọng	Kem sang trọng	["KHÁC"]	100	2025-11-21 22:31:45.50833	2025-11-21 22:31:45.50833	#EEECE7	0
87da7661-15cf-43e0-9e6a-cbc3d8ccee88	7885e516-1b25-4f4f-a446-c079b57f7841	Bộ Quà Tặng Túi Xách "Yêu Chiều"-Set quà tặng-Hapas-Đen quý phái	Đen quý phái	["KHÁC"]	100	2025-11-21 22:31:45.50833	2025-11-21 22:31:45.50833	#000000	0
a1517756-32b8-4050-888f-8fcace8b46d4	20f7bdde-110c-42c3-ab60-a4d4b4183129	Túi Xách Nữ Đai Ngang-Túi xách-Hapas-Xám xanh	Xám xanh	["KHÁC"]	100	2025-11-21 22:35:36.208679	2025-11-21 22:35:36.208679	#6083AD	0
3e6ba0f0-158c-4972-adca-fc16dc293b2e	cb28b0fe-77be-4b55-b590-8100f3d0ff66	Túi Xách Hobo Dập Nổi Line Embossed Jeans-Túi xách-Hapas-Jean	Jean	["KHÁC"]	100	2025-11-21 22:38:01.505441	2025-11-21 22:38:01.505441	#6083AD	0
c17c4013-b278-4343-99f4-09b3beb1ca10	66db372f-ef45-457b-b706-4300043987e7	Túi Giấy Đựng Quà Tặng Cao Cấp-Túi xách-Hapas-Nâu	Nâu	["KHÁC"]	100	2025-11-21 22:40:08.204808	2025-11-21 22:40:08.204808	#6F4019	0
86d18b89-35a7-4c47-be81-bf0b732de663	a55a54c4-52b1-410e-b9ec-f7afbcee916f	Túi đeo vai nữ LESAC-Túi xách-Lesac-Jean	Jean	["KHÁC"]	100	2025-11-22 00:40:49.484457	2025-11-22 00:40:49.484457	#BAC4D1	0
7ae4d39f-732e-401a-8f13-17ab26fd6c4b	a55a54c4-52b1-410e-b9ec-f7afbcee916f	Túi đeo vai nữ LESAC-Túi xách-Lesac-Vàng	Vàng	["KHÁC"]	100	2025-11-22 00:40:49.484457	2025-11-22 00:40:49.484457	#EEE7C9	0
c62f081a-6f85-431e-b0d5-a2cf29932cad	a55a54c4-52b1-410e-b9ec-f7afbcee916f	Túi đeo vai nữ LESAC-Túi xách-Lesac-Bạc	Bạc	["KHÁC"]	100	2025-11-22 00:40:49.484457	2025-11-22 00:40:49.484457	#E7EBEC	0
d3e405cf-82d2-4142-b98d-3b05e21dec0b	0a51eacc-eba4-41cf-8ec2-8f50fbaec231	Túi đeo vai nữ LESAC-Túi đeo chéo-Lesac-Đen	Đen	["KHÁC"]	100	2025-11-22 00:43:53.292088	2025-11-22 00:43:53.292088	#000000	0
c185740b-134e-4f9e-adb9-ec6fa732dff9	0a51eacc-eba4-41cf-8ec2-8f50fbaec231	Túi đeo vai nữ LESAC-Túi đeo chéo-Lesac-Be	Be	["KHÁC"]	100	2025-11-22 00:43:53.292088	2025-11-22 00:43:53.292088	#F5EFDE	0
0dbfa85a-162e-4791-8197-25710fb0c241	0a51eacc-eba4-41cf-8ec2-8f50fbaec231	Túi đeo vai nữ LESAC-Túi đeo chéo-Lesac-Latte	Latte	["KHÁC"]	100	2025-11-22 00:43:53.292088	2025-11-22 00:43:53.292088	#A18D7B	0
9bbe4863-0a5f-4500-9d57-95629b616341	df18b151-0c8e-45a9-996e-e5a390c6c36b	Túi mini đeo chéo nữ LESAC-Túi xách-Lesac-Xanh	Xanh	["KHÁC"]	100	2025-11-22 00:47:23.979128	2025-11-22 00:47:23.979128	#B9D3DF	0
4daff98e-af09-4bc3-86f0-7aec4d9c83e5	df18b151-0c8e-45a9-996e-e5a390c6c36b	Túi mini đeo chéo nữ LESAC-Túi xách-Lesac-Vàng	Vàng	["KHÁC"]	100	2025-11-22 00:47:23.979128	2025-11-22 00:47:23.979128	#E4D192	0
37527654-71b8-44b7-977f-4d2ce2d98212	df18b151-0c8e-45a9-996e-e5a390c6c36b	Túi mini đeo chéo nữ LESAC-Túi xách-Lesac-Hồng	Hồng	["KHÁC"]	100	2025-11-22 00:47:23.979128	2025-11-22 00:47:23.979128	#DFBFB5	0
5d524c1b-5fbb-4a0e-9f1c-e0ecfb38edec	df18b151-0c8e-45a9-996e-e5a390c6c36b	Túi mini đeo chéo nữ LESAC-Túi xách-Lesac-Trắng	Trắng	["KHÁC"]	100	2025-11-22 00:47:23.979128	2025-11-22 00:47:23.979128	#ffffff	0
23fd3630-e4fe-44e1-b2d4-9b69cd3a9ef6	21614097-a4f1-4478-94dd-bc5814781390	Túi xách nữ LESAC Mikala Bag-Túi xách-Lesac-Đen	Đen	["KHÁC"]	100	2025-11-22 00:52:03.178157	2025-11-22 00:52:03.178157	#000000	0
549ca905-0ff2-434f-9ce8-113c0582a154	21614097-a4f1-4478-94dd-bc5814781390	Túi xách nữ LESAC Mikala Bag-Túi xách-Lesac-Milky	Milky	["KHÁC"]	100	2025-11-22 00:52:03.178157	2025-11-22 00:52:03.178157	#ffffff	0
b96ed547-4dd4-4bc4-b400-5677dd47e657	9916b12c-1aed-4559-a137-831ba0a7a135	Ví nữ mini LESAC Nina Wallet-Ví nữ-Lesac-Đen	Đen	["KHÁC"]	100	2025-11-22 00:58:54.662991	2025-11-22 00:58:54.662991	#000000	0
01cc6604-1e18-45ea-8226-e525dcc196dd	9916b12c-1aed-4559-a137-831ba0a7a135	Ví nữ mini LESAC Nina Wallet-Ví nữ-Lesac-Đỏ	Đỏ	["KHÁC"]	100	2025-11-22 00:58:54.662991	2025-11-22 00:58:54.662991	#B4262F	0
06ea799b-a91f-47bd-97e9-e02f0272380c	9916b12c-1aed-4559-a137-831ba0a7a135	Ví nữ mini LESAC Nina Wallet-Ví nữ-Lesac-Be	Be	["KHÁC"]	100	2025-11-22 00:58:54.662991	2025-11-22 00:58:54.662991	#EAE4DE	0
a9a46b7a-71d6-465e-84fe-536f48212a27	10dda6b6-0dc6-4275-bfaf-79d42b4f3981	Ví nữ mini LESAC Stand Wallet-Ví nữ-Lesac-Đen	Đen	["KHÁC"]	100	2025-11-22 01:01:33.500018	2025-11-22 01:01:33.500018	#000000	0
80b1dade-8654-4f03-9e0c-67d201c97e0a	10dda6b6-0dc6-4275-bfaf-79d42b4f3981	Ví nữ mini LESAC Stand Wallet-Ví nữ-Lesac-Hồng	Hồng	["KHÁC"]	100	2025-11-22 01:01:33.500018	2025-11-22 01:01:33.500018	#C6AA9F	0
180f8ff0-cfe7-4a61-9afd-ceefedf602ed	f71f0055-6d01-48e4-8f8c-a66f252beee5	Ví nữ mini LESAC-Ví nữ-Lesac-Đen	Đen	["KHÁC"]	100	2025-11-22 01:07:55.451212	2025-11-22 01:07:55.451212	#000000	0
1f5fc79f-a4c6-47a7-a84f-73b545d5ddaf	f71f0055-6d01-48e4-8f8c-a66f252beee5	Ví nữ mini LESAC-Ví nữ-Lesac-Trắng	Trắng	["KHÁC"]	100	2025-11-22 01:07:55.451212	2025-11-22 01:07:55.451212	#EDE9E6	0
ba26ebb9-eebb-4fa8-bb61-6fc03eaa8215	f71f0055-6d01-48e4-8f8c-a66f252beee5	Ví nữ mini LESAC-Ví nữ-Lesac-Bạc	Bạc	["KHÁC"]	100	2025-11-22 01:07:55.451212	2025-11-22 01:07:55.451212	#B1A398	0
c1033304-7005-494e-a9c0-37b60ba39e99	8d2f3138-d789-49d5-9685-700010cef9c2	Gọng kính cận nữ oval-Gọng kính-Lilywear-Đen	Đen	["KHÁC"]	1000	2025-11-22 01:11:22.811508	2025-11-22 01:11:22.811508	#000000	0
328b1205-c6fc-4574-9c00-2d859b36246a	8d2f3138-d789-49d5-9685-700010cef9c2	Gọng kính cận nữ oval-Gọng kính-Lilywear-Đen trắng	Đen trắng	["KHÁC"]	1000	2025-11-22 01:11:22.811508	2025-11-22 01:11:22.811508	#afadad	0
93f7b864-4196-4039-9eeb-2c09cbf7a483	80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	Ví Da Nam Monogram AMOUR-Ví Nam-UNDERTHINKER-Ngang	Ngang	["KHÁC"]	100	2025-11-22 01:12:22.467824	2025-11-22 01:12:22.467824	#000000	0
44de312f-a1d5-4981-b31d-b2317b7a9d35	80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	Ví Da Nam Monogram AMOUR-Ví Nam-UNDERTHINKER-Đứng	Đứng	["KHÁC"]	100	2025-11-22 01:12:22.467824	2025-11-22 01:12:22.467824	#000000	0
e6705c1a-da46-48e2-8d61-e8b7d248427f	d575be52-133b-41d9-9039-8e67b038fa06	Ví Da Nam SOLAR Monogram-Ví Nam-UNDERTHINKER-Ngang	Ngang	["KHÁC"]	100	2025-11-22 01:15:22.368199	2025-11-22 01:15:22.368199	#000000	0
0e708936-574c-4767-bb50-5b2262c40e5c	d575be52-133b-41d9-9039-8e67b038fa06	Ví Da Nam SOLAR Monogram-Ví Nam-UNDERTHINKER-Đứng	Đứng	["KHÁC"]	100	2025-11-22 01:15:22.368199	2025-11-22 01:15:22.368199	#000000	0
441cdfbf-64d0-4871-83d8-248468ef0da9	4e6e2cae-5c0b-45a0-9ffa-b522ea3539a7	Gọng kính đa giác nữ-Gọng kính-Lilywear-Trắng	Trắng	["KHÁC"]	100	2025-11-22 01:15:39.968584	2025-11-22 01:15:39.968584	#fdc6c5	0
c433ec79-7c2a-4edf-848e-2fc3752ed72d	4e6e2cae-5c0b-45a0-9ffa-b522ea3539a7	Gọng kính đa giác nữ-Gọng kính-Lilywear-Hồng	Hồng	["KHÁC"]	100	2025-11-22 01:15:39.968584	2025-11-22 01:15:39.968584	#fdc6c3	0
2f6bb1f9-07f9-4ae6-94cb-9c85e040e84c	7421a801-320d-45d0-a565-20acf7f84c74	Gọng kính mắt tròn nam nữ-Gọng kính-Lilywear-Đen nhám	Đen nhám	["KHÁC"]	100	2025-11-22 01:18:14.604839	2025-11-22 01:18:14.604839	#b5b5b5	0
ecc61eee-abaf-486a-9f36-c7c5e9972f89	7421a801-320d-45d0-a565-20acf7f84c74	Gọng kính mắt tròn nam nữ-Gọng kính-Lilywear-Đen bóng	Đen bóng	["KHÁC"]	100	2025-11-22 01:18:14.604839	2025-11-22 01:18:14.604839	#313131	0
3295b413-a6d2-4c7d-a565-3c2be08f6062	faebc957-3d05-4c7c-abaf-278a5aa6aee5	Ví Da Gập Ba Nam Nữ LOGAN-Ví Nam-UNDERTHINKER-Đen	Đen	["KHÁC"]	100	2025-11-22 01:18:24.015192	2025-11-22 01:18:24.015192	#000000	0
adf8750d-7dd4-489d-bb7f-bf3c68614b2d	faebc957-3d05-4c7c-abaf-278a5aa6aee5	Ví Da Gập Ba Nam Nữ LOGAN-Ví Nam-UNDERTHINKER-Đen phối cam	Đen phối cam	["KHÁC"]	100	2025-11-22 01:18:24.015192	2025-11-22 01:18:24.015192	#8C3E21	0
5eb69340-0226-4331-9334-8da073708fc1	159b0c07-b24e-4fa0-b85c-9e4f3bfe244e	Gọng kính nữ mắt oval kim loại-Gọng kính-Lilywear-Đen trắng	Đen trắng	["KHÁC"]	98	2025-11-22 01:20:10.085176	2025-11-22 01:20:10.085176	#c3c3c1	0
b60d475e-c74f-4376-a2e0-b08a268e2cd8	159b0c07-b24e-4fa0-b85c-9e4f3bfe244e	Gọng kính nữ mắt oval kim loại-Gọng kính-Lilywear-Đen	Đen	["KHÁC"]	100	2025-11-22 01:20:10.085176	2025-11-22 01:20:10.085176	#323232	0
f69094c3-f711-4580-a5df-6cd28086897b	5dc9f680-cdda-44a9-9bf8-51688a32f426	Túi Da Nam Nữ Monogram DANTE-Túi đeo chéo-UNDERTHINKER-Đen phối nâu	Đen phối nâu	["KHÁC"]	100	2025-11-22 01:21:55.782503	2025-11-22 01:21:55.782503	#4E3632	0
59d2cd3d-ffdf-4c0f-b24e-8e9f6f7b1e4a	5dc9f680-cdda-44a9-9bf8-51688a32f426	Túi Da Nam Nữ Monogram DANTE-Túi đeo chéo-UNDERTHINKER-Đen	Đen	["KHÁC"]	100	2025-11-22 01:21:55.782503	2025-11-22 01:21:55.782503	#000000	0
f4c078ba-fb7c-4d5e-9177-cfea93f0e448	c6967f8e-0e52-4327-a7ef-dc238d043224	Túi Da Nam Nữ Monogram SLOCK-Ví Nam-UNDERTHINKER-Túi slock bag	Túi slock bag	["KHÁC"]	100	2025-11-22 01:27:33.125941	2025-11-22 01:27:33.125941	#000000	0
3857c9ec-6db0-4030-aefe-18db1c62e770	c6967f8e-0e52-4327-a7ef-dc238d043224	Túi Da Nam Nữ Monogram SLOCK-Ví Nam-UNDERTHINKER-Túi phone bag	Túi phone bag	["KHÁC"]	100	2025-11-22 01:27:33.125941	2025-11-22 01:27:33.125941	#000000	0
ef7fcf5f-1c13-4d78-8c5e-f3a3cd18643c	aa1181c1-13af-4d18-b081-d606013573ce	Gọng kính chất liệu Titan-Gọng kính-Lilywear-Đen trắng	Đen trắng	["KHÁC"]	100	2025-11-22 01:28:38.880719	2025-11-22 01:28:38.880719	#fbfbf9	0
15c71cfd-a912-4755-8b63-08928be7d730	aa1181c1-13af-4d18-b081-d606013573ce	Gọng kính chất liệu Titan-Gọng kính-Lilywear-Đen	Đen	["KHÁC"]	100	2025-11-22 01:28:38.880719	2025-11-22 01:28:38.880719	#313131	0
46f07f1a-78fb-4d91-a468-87a9d25647fb	4b02b03d-87c1-471d-a139-24fdc45541c9	Kính giả cận nam nhựa cứng cáp-Kính mát-Lilywear-Ghi	Ghi	["KHÁC"]	101	2025-11-22 01:33:49.836729	2025-11-22 01:33:49.836729	#bfbbbe	0
bde100cf-03b7-40a4-9087-f82b8294b018	4b02b03d-87c1-471d-a139-24fdc45541c9	Kính giả cận nam nhựa cứng cáp-Kính mát-Lilywear-Hồng	Hồng	["KHÁC"]	103	2025-11-22 01:33:49.836729	2025-11-22 01:33:49.836729	#e4c5c6	0
c1fc770c-5985-4198-a3eb-19b84f38820c	76bb9b2a-7805-4461-b924-e3d0c06a77b5	Ví Đứng Da Đựng Thẻ-Ví Nam-UNDERTHINKER-Đen	Đen	["KHÁC"]	100	2025-11-22 01:34:45.427627	2025-11-22 01:34:45.427627	#000000	0
3284e4c4-e954-4f5a-bf79-a17e4e8bbce7	65595694-dc73-40b5-b1e9-b7663e86b027	Kính mắt nam nữ tròn to-Kính mát-Lilywear-Trắng vàng	Trắng vàng	["KHÁC"]	1000	2025-11-22 01:36:43.903285	2025-11-22 01:36:43.903285	#e5dcd5	0
8241c6f1-1bcb-4841-a2b3-e183bf3a6540	65595694-dc73-40b5-b1e9-b7663e86b027	Kính mắt nam nữ tròn to-Kính mát-Lilywear-Nâu	Nâu	["KHÁC"]	1030	2025-11-22 01:36:43.903285	2025-11-22 01:36:43.903285	#b39a91	0
e322f7c6-15e2-49e1-9310-bc2b3dc56164	f413b48a-852b-40be-8b84-d52b589dc8fb	Túi Hộp Da Đeo Chéo PERRY-Túi đeo chéo-UNDERTHINKER-Đen	Đen	["KHÁC"]	100	2025-11-22 01:37:59.294365	2025-11-22 01:37:59.294365	#000000	0
e8384f20-6322-4de1-8fd6-2ca89f5c5fdb	552d1685-d268-43c6-96a3-152faf60cb19	Kính gọng tròn màu sắc thời trang-Gọng kính-Lilywear-Xám nhạt	Xám nhạt	["KHÁC"]	100	2025-11-22 01:40:25.749006	2025-11-22 01:40:25.749006	#555558	0
785068b0-3bba-42c6-aa29-0355b4a0e30e	552d1685-d268-43c6-96a3-152faf60cb19	Kính gọng tròn màu sắc thời trang-Gọng kính-Lilywear-Đen	Đen	["KHÁC"]	100	2025-11-22 01:40:25.749006	2025-11-22 01:40:25.749006	#383838	0
402d387e-d08a-4e39-a84b-4472ad66fc74	d9a7b733-5b82-42bf-b279-22791f057658	Áo Hoodie Morning Star Bunny-Áo Hoodie-Teelab-Kem	Kem	["M", "L", "XL", "XXL"]	100	2025-11-22 01:48:38.505082	2025-11-22 01:48:38.505082	#EBE8E0	0
0518291d-4ca8-4938-b3fb-b113899bc8e9	80275163-3c62-48ee-b03e-574eea49687f	Áo Thun Teelab Basketball Jersey-Áo thun-Teelab-Trắng	Trắng	["M", "L", "XL"]	101	2025-11-22 01:55:45.629673	2025-11-22 01:55:45.629673	#ffffff	0
24b650c4-1e74-4f49-a39e-732cb56a6c10	80275163-3c62-48ee-b03e-574eea49687f	Áo Thun Teelab Basketball Jersey-Áo thun-Teelab-Xanh than	Xanh than	["M", "L", "XL"]	100	2025-11-22 01:55:45.629673	2025-11-22 01:55:45.629673	#1C1F45	0
7ae14af9-d46c-4c81-9a51-fcc0b4763940	80275163-3c62-48ee-b03e-574eea49687f	Áo Thun Teelab Basketball Jersey-Áo thun-Teelab-Đen	Đen	["M", "L", "XL"]	101	2025-11-22 01:55:45.629673	2025-11-22 01:55:45.629673	#000000	0
85975aa0-a03c-4431-8e64-cbc4fe6cdffb	a6954114-27c7-479c-ab67-5eb106420bcf	Áo Thun Teelab Sporty Side-Line-Áo thun-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 01:58:53.7582	2025-11-22 01:58:53.7582	#000000	0
ad683076-5b41-4045-87df-75634b1d170c	a6954114-27c7-479c-ab67-5eb106420bcf	Áo Thun Teelab Sporty Side-Line-Áo thun-Teelab-Xám	Xám	["M", "L", "XL"]	100	2025-11-22 01:58:53.7582	2025-11-22 01:58:53.7582	#6F737D	0
5d02b776-a946-490d-bf0d-ed21c6c7ec1a	a6954114-27c7-479c-ab67-5eb106420bcf	Áo Thun Teelab Sporty Side-Line-Áo thun-Teelab-Be	Be	["M", "L", "XL"]	100	2025-11-22 01:58:53.7582	2025-11-22 01:58:53.7582	#E7E3DD	0
9dd6b4f7-a1d4-4777-8e28-ee12aa44c2d3	a6954114-27c7-479c-ab67-5eb106420bcf	Áo Thun Teelab Sporty Side-Line-Áo thun-Teelab-Xanh đen	Xanh đen	["M", "L", "XL"]	100	2025-11-22 01:58:53.7582	2025-11-22 01:58:53.7582	#1C1F45	0
791414cb-5c7a-467e-a200-7b6212c309b5	8ec6ce6d-2227-4f33-8e83-67b84d9087a8	Áo Thun Wash Rodeos-Áo thun-Teelab-wash xám	wash xám	["M", "L", "XL"]	100	2025-11-22 02:02:29.492357	2025-11-22 02:02:29.492357	#474447	0
478de674-fa60-4a5e-b443-562a53148e5c	8ec6ce6d-2227-4f33-8e83-67b84d9087a8	Áo Thun Wash Rodeos-Áo thun-Teelab-wash nâu	wash nâu	["M", "L", "XL"]	100	2025-11-22 02:02:29.492357	2025-11-22 02:02:29.492357	#474447	0
a279a487-4c49-4f52-9c0b-cc22b3eccd5d	ee61f1a8-b86b-4a3c-8007-a387357958f9	Kính giả cận chống ánh sáng xanh-Kính mát-Lilywear-Đen	Đen	["KHÁC"]	100	2025-11-22 02:05:06.244889	2025-11-22 02:05:06.244889	#464549	0
bab793ec-b9b2-4df9-b8b5-84c77ae688db	ee61f1a8-b86b-4a3c-8007-a387357958f9	Kính giả cận chống ánh sáng xanh-Kính mát-Lilywear-Ghi	Ghi	["KHÁC"]	100	2025-11-22 02:05:06.244889	2025-11-22 02:05:06.244889	#bfbbbe	0
099c0c7e-7fb6-4711-af8e-6b89741288a1	8d66e327-bce2-451f-822b-9eb027495e6b	Áo Thun Slow Sunday T-Shirt-Áo thun-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 02:05:19.116977	2025-11-22 02:05:19.116977	#000000	0
bf3531f6-1187-4b20-a7d4-a2d8d247b61c	8d66e327-bce2-451f-822b-9eb027495e6b	Áo Thun Slow Sunday T-Shirt-Áo thun-Teelab-Kem	Kem	["M", "L", "XL"]	100	2025-11-22 02:05:19.116977	2025-11-22 02:05:19.116977	#F7F7F1	0
91583eb9-c21c-4937-801b-f714d5b66cd1	6a88af12-6b0a-47b2-9516-f2cbef7a4081	Kính giả cận nam thời trang-Kính mát-Lilywear-Hồng	Hồng	["KHÁC"]	102	2025-11-22 02:06:34.23241	2025-11-22 02:06:34.23241	#e2c5c6	0
ece315e6-70a2-4acf-9b89-4eeb64498b98	f5b43ac7-eec0-4217-8204-e38ceca74632	Áo Thun Keyboard Form Rộng-Áo thun-Teelab-Trắng	Trắng	["M", "L", "XL"]	100	2025-11-22 02:08:05.119082	2025-11-22 02:08:05.119082	#ffffff	0
16f297c4-20db-43c6-93f4-f589802f0eab	f5b43ac7-eec0-4217-8204-e38ceca74632	Áo Thun Keyboard Form Rộng-Áo thun-Teelab-Xám tiêu	Xám tiêu	["M", "L", "XL"]	100	2025-11-22 02:08:05.119082	2025-11-22 02:08:05.119082	#D9D9D9	0
e4df1006-ba66-443d-9226-d4bdb3d55e14	ede10d4a-99f5-4a5c-85b7-fa4fac464fa5	Gọng kính mắt Oval màu sắc thời trang-Gọng kính-Lilywear-Đen	Đen	["KHÁC"]	100	2025-11-22 02:09:06.273248	2025-11-22 02:09:06.273248	#333136	0
e87ca598-d957-4a47-b328-9faec07c2770	ede10d4a-99f5-4a5c-85b7-fa4fac464fa5	Gọng kính mắt Oval màu sắc thời trang-Gọng kính-Lilywear-Vàng	Vàng	["KHÁC"]	100	2025-11-22 02:09:06.273248	2025-11-22 02:09:06.273248	#e9b659	0
06393df3-cf6c-4559-b102-d15d1fd5680d	ede10d4a-99f5-4a5c-85b7-fa4fac464fa5	Gọng kính mắt Oval màu sắc thời trang-Gọng kính-Lilywear-Trắng	Trắng	["KHÁC"]	100	2025-11-22 02:09:06.273248	2025-11-22 02:09:06.273248	#fbfbfb	0
e1cdd71f-519b-41bd-852a-2869f734e204	54f193bc-c235-43e6-8736-54f5e0844064	Áo Thun Mini Icons Tshirt-Áo thun-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 02:11:27.083353	2025-11-22 02:11:27.083353	#000000	0
65adcde1-8ec1-4557-9533-069b032a5c3e	72a09739-6b1a-49a5-9837-a7d782b71b13	Áo Polo Sweater Nỉ Chân Cua Basic-Áo Hoodie - Sweater-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 02:15:45.163057	2025-11-22 02:15:45.163057	#000000	0
aa471a50-2699-4c37-8261-a1b8fff08af7	72a09739-6b1a-49a5-9837-a7d782b71b13	Áo Polo Sweater Nỉ Chân Cua Basic-Áo Hoodie - Sweater-Teelab-Xám ghi	Xám ghi	["M", "L", "XL"]	100	2025-11-22 02:15:45.163057	2025-11-22 02:15:45.163057	#5F5F5F	0
8c204a16-f565-4deb-a862-e903796f49e4	72a09739-6b1a-49a5-9837-a7d782b71b13	Áo Polo Sweater Nỉ Chân Cua Basic-Áo Hoodie - Sweater-Teelab-Xanh navy	Xanh navy	["M", "L", "XL"]	100	2025-11-22 02:15:45.163057	2025-11-22 02:15:45.163057	#2C3244	0
3a4f5ef0-16ed-46bb-9182-0317b9fc1ed2	72a09739-6b1a-49a5-9837-a7d782b71b13	Áo Polo Sweater Nỉ Chân Cua Basic-Áo Hoodie - Sweater-Teelab-Đỏ	Đỏ	["M", "L", "XL"]	100	2025-11-22 02:15:45.163057	2025-11-22 02:15:45.163057	#BC273A	0
3a489c75-9727-4347-a01c-54d5823230bd	44df2435-da86-44aa-ab4d-2901eb203d4e	Gọng kính cổ điển thời trang-Gọng kính-Lilywear-Đen xám	Đen xám	["KHÁC"]	100	2025-11-22 02:18:50.129207	2025-11-22 02:18:50.129207	#696a6f	0
04f5bc4c-be1b-42da-9948-3605769e965a	44df2435-da86-44aa-ab4d-2901eb203d4e	Gọng kính cổ điển thời trang-Gọng kính-Lilywear-Vàng nhạt	Vàng nhạt	["KHÁC"]	99	2025-11-22 02:18:50.129207	2025-11-22 02:18:50.129207	#d5ccc5	0
6cad0572-df54-4195-8389-a6d2da0dd317	72a09739-6b1a-49a5-9837-a7d782b71b13	Áo Polo Sweater Nỉ Chân Cua Basic-Áo Hoodie - Sweater-Teelab-Xám tiêu	Xám tiêu	["M", "L", "XL"]	99	2025-11-22 02:15:45.163057	2025-11-25 10:44:00.867061	#DBDDDC	1
4e962e4b-2c3a-45f8-b0ef-05dff7677ea7	44df2435-da86-44aa-ab4d-2901eb203d4e	Gọng kính cổ điển thời trang-Gọng kính-Lilywear-Đen trong	Đen trong	["KHÁC"]	100	2025-11-22 02:18:50.129207	2025-11-22 02:18:50.129207	#b1b2b8	0
d744d0c8-9420-4574-b863-99416a8d3124	dadfbde5-a74d-48d9-9f03-1af9943a92ed	Áo Sơ Mi Tay Dài Kẻ Sọc-Áo sơ mi-Teelab-Xanh	Xanh	["M", "L", "XL"]	100	2025-11-22 02:18:54.232664	2025-11-22 02:18:54.232664	#D2D4E2	0
b5bb2533-fbe6-4bcf-b67c-03c4a76e8e7b	dadfbde5-a74d-48d9-9f03-1af9943a92ed	Áo Sơ Mi Tay Dài Kẻ Sọc-Áo sơ mi-Teelab-Xám	Xám	["M", "L", "XL"]	100	2025-11-22 02:18:54.232664	2025-11-22 02:18:54.232664	#D1D1D1	0
30b63e57-4774-4189-8b96-0f1cdd11cb21	dadfbde5-a74d-48d9-9f03-1af9943a92ed	Áo Sơ Mi Tay Dài Kẻ Sọc-Áo sơ mi-Teelab-Hồng	Hồng	["M", "L", "XL"]	1	2025-11-22 02:18:54.232664	2025-11-22 02:18:54.232664	#E3CDD3	0
62e7a000-0b23-43e1-b62f-9524adef3237	b346f32d-4f9b-4343-99f3-044ef538547c	Gọng kính mắt mèo thời trang-Gọng kính-Lilywear-Hồng cánh sen	Hồng cánh sen	["KHÁC"]	100	2025-11-22 02:21:15.151022	2025-11-22 02:21:15.151022	#d8c8c8	0
601dc2c7-45ae-49b3-ab23-1426f564c88c	b346f32d-4f9b-4343-99f3-044ef538547c	Gọng kính mắt mèo thời trang-Gọng kính-Lilywear-Cam nhạt	Cam nhạt	["KHÁC"]	101	2025-11-22 02:21:15.151022	2025-11-22 02:21:15.151022	#e6c9b6	0
0b0198f6-309c-4110-8c8d-004e30d044a9	b346f32d-4f9b-4343-99f3-044ef538547c	Gọng kính mắt mèo thời trang-Gọng kính-Lilywear-Thủy tinh	Thủy tinh	["KHÁC"]	100	2025-11-22 02:21:15.151022	2025-11-22 02:21:15.151022	#f9f5f3	0
9a021330-7cb1-46bc-b1fb-56aed5be75d4	8688f9ce-06bd-4ec4-acbd-15d32fd161b8	Kính giả cận gọng đa giác kim loại-Kính mát-Lilywear-Xanh rêu	Xanh rêu	["KHÁC"]	100	2025-11-22 02:23:29.959772	2025-11-22 02:23:29.959772	#838988	0
e3bf0e3f-cf7e-440a-a5f4-ba1bba17a5e4	8688f9ce-06bd-4ec4-acbd-15d32fd161b8	Kính giả cận gọng đa giác kim loại-Kính mát-Lilywear-Xanh ri	Xanh ri	["KHÁC"]	100	2025-11-22 02:23:29.959772	2025-11-22 02:23:29.959772	#8c8977	0
4ca8f3c3-8ce2-43d8-80ee-f51aea8a6745	8688f9ce-06bd-4ec4-acbd-15d32fd161b8	Kính giả cận gọng đa giác kim loại-Kính mát-Lilywear-Vàng chanh	Vàng chanh	["KHÁC"]	100	2025-11-22 02:23:29.959772	2025-11-22 02:23:29.959772	#f2eadb	0
1fafa171-5d52-4a77-ba4f-c84a34e81a36	40877b39-0034-46ec-877d-bdc02bfcbffd	Quần Kaki Xếp Ly Form Rộng Ống Suông-Quần Âu - Ống suông-Teelab-Kem	Kem	["M", "L", "XL"]	100	2025-11-22 02:24:43.621138	2025-11-22 02:24:43.621138	#E6DAD1	0
97d2bb5a-c94d-4ef2-a438-40e8bbd2167c	3cb525c1-f752-4313-a92b-84c4d206928d	Kính 0 độ nhẹ nhàng thời trang-Kính mát-Lilywear-Trong suốt	Trong suốt	["KHÁC"]	99	2025-11-22 02:27:26.849119	2025-11-22 02:27:26.849119	#ebeae9	0
f67bfe2a-54d6-4a4b-ab96-9a48888d9431	3cb525c1-f752-4313-a92b-84c4d206928d	Kính 0 độ nhẹ nhàng thời trang-Kính mát-Lilywear-Nâu đất	Nâu đất	["KHÁC"]	100	2025-11-22 02:27:26.849119	2025-11-22 02:27:26.849119	#695c4d	0
405243ca-d1a3-439f-b26d-c20cd9ae35bd	36e08bfd-a6e4-4051-8b92-5d369fcc4a71	Áo Sơ Mi Eco Oxford Signature-Áo sơ mi-Teelab-Xanh	Xanh	["M", "L", "XL"]	100	2025-11-22 02:28:21.247795	2025-11-22 02:28:21.247795	#CFDCEE	0
52e1240c-9789-4c56-95d1-fcfe4469f888	36e08bfd-a6e4-4051-8b92-5d369fcc4a71	Áo Sơ Mi Eco Oxford Signature-Áo sơ mi-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 02:28:21.247795	2025-11-22 02:28:21.247795	#000000	0
51e558e7-562b-4fbc-b3a1-7f1f6db8e818	36e08bfd-a6e4-4051-8b92-5d369fcc4a71	Áo Sơ Mi Eco Oxford Signature-Áo sơ mi-Teelab-Hồng	Hồng	["M", "L", "XL"]	100	2025-11-22 02:28:21.247795	2025-11-22 02:28:21.247795	#ECCFE9	0
dcc24d66-c1e7-4962-b64b-16067fdb0022	36e08bfd-a6e4-4051-8b92-5d369fcc4a71	Áo Sơ Mi Eco Oxford Signature-Áo sơ mi-Teelab-Trắng	Trắng	["M", "L", "XL"]	100	2025-11-22 02:28:21.247795	2025-11-22 02:28:21.247795	#ffffff	0
6015cd96-1845-42be-bf66-49eb2f34f253	1b85f0ab-968d-426e-8f30-cd790618b67f	Áo Sơ Mi Cộc Tay Striped Boxy-Áo sơ mi-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 02:30:11.966408	2025-11-22 02:30:11.966408	#000000	0
31eaeff2-3081-4132-b727-00d835035c9d	7d0663ca-e5c5-458d-b753-b6f4a3f9176c	Áo Bóng Chày Kẻ Sọc Jersey Striped-Áo sơ mi-Teelab-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 02:32:26.023275	2025-11-22 02:32:26.023275	#000000	0
a224cc8a-3f87-474d-8ee8-9f1e2cbdbee7	7d0663ca-e5c5-458d-b753-b6f4a3f9176c	Áo Bóng Chày Kẻ Sọc Jersey Striped-Áo sơ mi-Teelab-Đỏ	Đỏ	["M", "L", "XL"]	100	2025-11-22 02:32:26.023275	2025-11-22 02:32:26.023275	#D59AA6	0
49b3fe7c-7b25-425c-ab76-c88905a2df8d	44ffb6ce-2d0c-43d8-a4f8-344dcc17847a	Áo Khoác Nam VINTINO Thêu Logo-Áo Varsity - Bomber-Vintino-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 23:33:35.458403	2025-11-22 23:33:35.458403	#000000	0
3f6c46a1-9575-4a34-b1f5-f84ed768b0a5	44ffb6ce-2d0c-43d8-a4f8-344dcc17847a	Áo Khoác Nam VINTINO Thêu Logo-Áo Varsity - Bomber-Vintino-Xám	Xám	["M", "L", "XL"]	100	2025-11-22 23:33:35.458403	2025-11-22 23:33:35.458403	#E1E0E3	0
161e7470-c84a-4d46-ab47-3c910580805b	44ffb6ce-2d0c-43d8-a4f8-344dcc17847a	Áo Khoác Nam VINTINO Thêu Logo-Áo Varsity - Bomber-Vintino-Xanh	Xanh	["M", "L", "XL"]	100	2025-11-22 23:33:35.458403	2025-11-22 23:33:35.458403	#27293F	0
c23eb7c6-7aa1-4cb6-bfe4-1c6be1297fd7	6e0e4f2a-3c49-4b89-b82f-cc2d1a127690	Áo Khoác Bomber Dù Hai Lớp-Áo Varsity - Bomber-Vintino-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 23:37:08.018804	2025-11-22 23:37:08.018804	#000000	0
7c3a5e3a-ca93-4472-8279-9820feacb9e9	6e0e4f2a-3c49-4b89-b82f-cc2d1a127690	Áo Khoác Bomber Dù Hai Lớp-Áo Varsity - Bomber-Vintino-Kem	Kem	["M", "L", "XL"]	100	2025-11-22 23:37:08.018804	2025-11-22 23:37:08.018804	#D1C8C5	0
e86b0bb4-15fd-48c7-8309-961d330f9a6f	5948ad05-3969-43c8-bc89-be43117c2282	Áo Hoodie Zip Form Rộng-Áo Hoodie - Sweater-Vintino-Xám đậm	Xám đậm	["M", "L", "XL"]	100	2025-11-22 23:43:43.097149	2025-11-22 23:43:43.097149	#8B8B8B	0
35cf5495-78c8-427e-8757-9e1afcf7e7fe	d3e20b93-a1e4-463d-8935-e2afdfa1c369	Áo Khoác Gió 2 Mặt-Áo Varsity - Bomber-Vintino-Đen phối trắng	Đen phối trắng	["M", "L", "XL"]	100	2025-11-22 23:47:21.607344	2025-11-22 23:47:21.607344	#29282C	0
cefcdb72-84fc-4c54-8bb9-e6fe59d73ede	d3e20b93-a1e4-463d-8935-e2afdfa1c369	Áo Khoác Gió 2 Mặt-Áo Varsity - Bomber-Vintino-Đỏ phối trắng	Đỏ phối trắng	["M", "L", "XL"]	100	2025-11-22 23:47:21.607344	2025-11-22 23:47:21.607344	#DDCCCC	0
31727b8d-67cc-4690-a10e-b93412dc1394	d3e20b93-a1e4-463d-8935-e2afdfa1c369	Áo Khoác Gió 2 Mặt-Áo Varsity - Bomber-Vintino-Đen phối đỏ	Đen phối đỏ	["M", "L", "XL"]	100	2025-11-22 23:47:21.607344	2025-11-22 23:47:21.607344	#821C35	0
7e221b18-7b93-485e-92cf-fab28ffed907	a14e341c-b408-4d64-89eb-174b6ccc29fd	Quần Shorts thể thao thoáng khí Exdry-Quần short-Coolmate-Xám	Xám	["XS", "S", "M", "XL", "XXL"]	102	2025-11-22 23:49:54.029155	2025-11-22 23:49:54.029155	#898b8e	0
7df55ce3-d81f-447b-aa68-57c55215dc9c	a14e341c-b408-4d64-89eb-174b6ccc29fd	Quần Shorts thể thao thoáng khí Exdry-Quần short-Coolmate-Đen	Đen	["XS", "M", "XL", "XXL"]	100	2025-11-22 23:49:54.029155	2025-11-22 23:49:54.029155	#424145	0
b2c129a1-a809-4c62-9ac0-6c99aa97b518	a14e341c-b408-4d64-89eb-174b6ccc29fd	Quần Shorts thể thao thoáng khí Exdry-Quần short-Coolmate-Navy	Navy	["S", "M", "L", "XL", "XXL"]	100	2025-11-22 23:49:54.029155	2025-11-22 23:49:54.029155	#434a61	0
73a2b96e-7e58-45f9-b38c-863796069e2c	be673b6c-0b78-48df-a2aa-bd9d4b48536c	Quần Short Nam Trơn Vải Kaki-Quần short-Vintino-Be	Be	["M", "L", "XL"]	100	2025-11-22 23:51:59.849359	2025-11-22 23:51:59.849359	#C0AB92	0
d988c4ff-f251-464e-83f0-cb9131e32651	be673b6c-0b78-48df-a2aa-bd9d4b48536c	Quần Short Nam Trơn Vải Kaki-Quần short-Vintino-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 23:51:59.849359	2025-11-22 23:51:59.849359	#000000	0
252dbcd0-dfac-484f-b60d-0ce36e3b1001	be673b6c-0b78-48df-a2aa-bd9d4b48536c	Quần Short Nam Trơn Vải Kaki-Quần short-Vintino-Xanh rêu	Xanh rêu	["M", "L", "XL"]	100	2025-11-22 23:51:59.849359	2025-11-22 23:51:59.849359	#A5A18E	0
f588e0ed-2693-4f99-855f-fa3019f9ddd7	be673b6c-0b78-48df-a2aa-bd9d4b48536c	Quần Short Nam Trơn Vải Kaki-Quần short-Vintino-Trắng	Trắng	["M", "L", "XL"]	100	2025-11-22 23:51:59.849359	2025-11-22 23:51:59.849359	#ffffff	0
0c90b758-dba4-4a2a-a5dc-1731f3497bf7	261926a1-8d99-40a6-b10c-2089a738e0dd	Quần Short Jean Nam Vintino Form Trẻ Trung-Quần short-Vintino-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 23:55:05.384308	2025-11-22 23:55:05.384308	#000000	0
93a992a4-2a3e-44f8-9063-3707a0c640c4	3bd8a250-7654-4f7b-9a80-6fc050a67a3b	Ví nữ chần gập đôi-Ví nữ-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 00:51:12.806888	2025-11-23 00:51:12.806888	#000000	0
1fb0034e-4907-4678-b13d-1b4da10f8748	5948ad05-3969-43c8-bc89-be43117c2282	Áo Hoodie Zip Form Rộng-Áo Hoodie - Sweater-Vintino-Đen	Đen	["M", "L", "XL"]	99	2025-11-22 23:43:43.097149	2025-11-25 14:06:21.795085	#313037	1
4baee306-8638-45b8-b05b-d7c2a84d9426	261926a1-8d99-40a6-b10c-2089a738e0dd	Quần Short Jean Nam Vintino Form Trẻ Trung-Quần short-Vintino-Xanh denim	Xanh denim	["M", "L", "XL"]	100	2025-11-22 23:55:05.384308	2025-11-22 23:55:05.384308	#616E78	0
4be78321-638a-46a6-8f1a-4461e493652e	74b7129b-490a-4fa0-baaa-dfbd7d3d2d8a	Quần shorts ECC Ripstop Coolmate-Quần short-Coolmate-Xám sáng	Xám sáng	["L", "XL", "XXL"]	100	2025-11-22 23:56:26.136079	2025-11-22 23:56:26.136079	#c9c9c7	0
91a32d13-3767-426f-81b7-8d1aef8c6480	74b7129b-490a-4fa0-baaa-dfbd7d3d2d8a	Quần shorts ECC Ripstop Coolmate-Quần short-Coolmate-Xanh lá đậm	Xanh lá đậm	["L", "XL", "XXL"]	100	2025-11-22 23:56:26.136079	2025-11-22 23:56:26.136079	#5e6058	0
26ae6014-d42c-4d1a-b6ae-2bcce267c641	74b7129b-490a-4fa0-baaa-dfbd7d3d2d8a	Quần shorts ECC Ripstop Coolmate-Quần short-Coolmate-Đen	Đen	["L", "XL", "XXL"]	100	2025-11-22 23:56:26.136079	2025-11-22 23:56:26.136079	#444549	0
684f3ab2-a962-4947-8155-7bf78a75ec52	7cdbae4c-ed12-481e-96ed-8c395173757e	Quần Short Jean Đùi Cộc Rách Gối-Quần short-Vintino-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 23:57:08.814932	2025-11-22 23:57:08.814932	#000000	0
fd5835b1-be29-4f7c-9baa-092159230701	7cdbae4c-ed12-481e-96ed-8c395173757e	Quần Short Jean Đùi Cộc Rách Gối-Quần short-Vintino-Xám	Xám	["M", "L", "XL"]	100	2025-11-22 23:57:08.814932	2025-11-22 23:57:08.814932	#6E7273	0
505aebbe-277a-418b-b0e6-cc4b9cda9f4d	6bed6005-f417-4c9e-ac03-94f8e8928f56	Quần Chino nam 7 inch-Quần short-Coolmate-Xanh navy	Xanh navy	["M", "XL", "XXL"]	100	2025-11-22 23:58:48.600226	2025-11-22 23:58:48.600226	#515660	0
1ca7d262-4cc7-4cce-915c-e8f0ee1011de	6bed6005-f417-4c9e-ac03-94f8e8928f56	Quần Chino nam 7 inch-Quần short-Coolmate-Trắng	Trắng	["L", "XL", "XXL"]	100	2025-11-22 23:58:48.600226	2025-11-22 23:58:48.600226	#ececed	0
cc97e1bf-2fb1-4b32-a928-9ca2eae985d9	6bed6005-f417-4c9e-ac03-94f8e8928f56	Quần Chino nam 7 inch-Quần short-Coolmate-Đen	Đen	["L", "XL", "XXL"]	98	2025-11-22 23:58:48.600226	2025-11-22 23:58:48.600226	#494949	0
b9d8bc54-9bcb-4844-af57-ab4b15a26a0f	e8decc54-4b81-4835-a928-ae70f62d4144	Quần Short Đùi Nam Nữ Túi Hộp Cúc Bấm Vải Kaki-Quần short-Vintino-Đen	Đen	["M", "L", "XL"]	100	2025-11-22 23:59:04.928774	2025-11-22 23:59:04.928774	#000000	0
a5156913-3849-4ebe-8895-df265451fe56	e8decc54-4b81-4835-a928-ae70f62d4144	Quần Short Đùi Nam Nữ Túi Hộp Cúc Bấm Vải Kaki-Quần short-Vintino-Be	Be	["M", "L", "XL"]	100	2025-11-22 23:59:04.928774	2025-11-22 23:59:04.928774	#D0C3B0	0
ff92bed7-0ecd-4e67-85a4-dfcb68bf7361	2d28ac84-8b33-4ba8-998f-6fc19b52f88c	Quần Âu Nam Hàn Quốc Ống Côn Công Sở-Quần Âu - Ống suông-Vintino-Đen	Đen	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:04.983684	2025-11-23 00:03:04.983684	#000000	0
8bc7c1f1-2061-46b9-88f9-6e4c8a4823c3	2d28ac84-8b33-4ba8-998f-6fc19b52f88c	Quần Âu Nam Hàn Quốc Ống Côn Công Sở-Quần Âu - Ống suông-Vintino-Be	Be	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:04.983684	2025-11-23 00:03:04.983684	#D6D3CD	0
1cc5e76c-0c6c-4d89-bc12-e8bb274944e2	2d28ac84-8b33-4ba8-998f-6fc19b52f88c	Quần Âu Nam Hàn Quốc Ống Côn Công Sở-Quần Âu - Ống suông-Vintino-Ghi đậm	Ghi đậm	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:04.983684	2025-11-23 00:03:04.983684	#838383	0
10f70a31-a3e4-4627-8738-1f5df76a2afa	2d28ac84-8b33-4ba8-998f-6fc19b52f88c	Quần Âu Nam Hàn Quốc Ống Côn Công Sở-Quần Âu - Ống suông-Vintino-Ghi nhạt	Ghi nhạt	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:04.983684	2025-11-23 00:03:04.983684	#868AA0	0
0eef047a-eb9b-4271-8628-642f46e19e6a	2d28ac84-8b33-4ba8-998f-6fc19b52f88c	Quần Âu Nam Hàn Quốc Ống Côn Công Sở-Quần Âu - Ống suông-Vintino-Xanh than	Xanh than	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:04.983684	2025-11-23 00:03:04.983684	#475269	0
d22fd479-5231-40a6-9c17-879c2a906d8a	b32f0184-66b2-4da1-ae07-a53d522a8991	Quần Short Nam Thể Thao Promax-S1-Quần short-Coolmate-Xanh navy	Xanh navy	["XS", "S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:52.418356	2025-11-23 00:03:52.418356	#495d6f	0
775575b6-b3c3-4b24-9ab7-0acc86551d99	b32f0184-66b2-4da1-ae07-a53d522a8991	Quần Short Nam Thể Thao Promax-S1-Quần short-Coolmate-Đen	Đen	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:03:52.418356	2025-11-23 00:03:52.418356	#414145	0
0e676dc4-5468-4bd9-998d-e5f52a656f43	17129133-69e0-4be2-9b2f-2b32a406474e	Quần Thể Thao Nam 7" Ultra Shorts-Quần short-Coolmate-Xám	Xám	["XXL"]	100	2025-11-23 00:06:28.49407	2025-11-23 00:06:28.49407	#5d5d5d	0
21105801-1a7e-4a98-85f5-d3b13e592d33	17129133-69e0-4be2-9b2f-2b32a406474e	Quần Thể Thao Nam 7" Ultra Shorts-Quần short-Coolmate-Xanh rêu	Xanh rêu	["XXL"]	100	2025-11-23 00:06:28.49407	2025-11-23 00:06:28.49407	#777c6c	0
03ccafbd-3a65-4262-abca-b7ea3454b0be	fd104ffe-9365-4607-ac3c-984671638ba0	Quần short thể thao nam Promax-S1-Quần short-Coolmate-Xanh	Xanh	["XXL"]	100	2025-11-23 00:08:34.729574	2025-11-23 00:08:34.729574	#566d86	0
06bfd6bc-58da-436e-936a-696639d0abb2	fd104ffe-9365-4607-ac3c-984671638ba0	Quần short thể thao nam Promax-S1-Quần short-Coolmate-Xanh navy	Xanh navy	["XL", "XXL"]	100	2025-11-23 00:08:34.729574	2025-11-23 00:08:34.729574	#3f4e56	0
9c704ec3-f310-44a2-bb2c-adc643fdba3c	fd104ffe-9365-4607-ac3c-984671638ba0	Quần short thể thao nam Promax-S1-Quần short-Coolmate-Đen nhạt	Đen nhạt	["XL", "XXL"]	103	2025-11-23 00:08:34.729574	2025-11-23 00:08:34.729574	#46494c	0
b0ede5a4-b3b1-4c7e-a4f5-7a9ed8834f80	155f54ef-0bfd-497b-9227-cbbb490fe679	Quần Âu Nam Hàn Quốc Dáng Baggy-Quần Âu - Ống suông-Vintino-Đen	Đen	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:08:58.962744	2025-11-23 00:08:58.962744	#000000	0
1c9834dd-09ad-4d96-bc8b-6a44bfdbd454	155f54ef-0bfd-497b-9227-cbbb490fe679	Quần Âu Nam Hàn Quốc Dáng Baggy-Quần Âu - Ống suông-Vintino-Be	Be	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:08:58.962744	2025-11-23 00:08:58.962744	#B6A496	0
3a12ad41-36e8-4915-a4c2-479306089eeb	155f54ef-0bfd-497b-9227-cbbb490fe679	Quần Âu Nam Hàn Quốc Dáng Baggy-Quần Âu - Ống suông-Vintino-Xám đậm	Xám đậm	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:08:58.962744	2025-11-23 00:08:58.962744	#868685	0
3f6602ad-e161-4e89-8c0e-5ff8e2632382	c9fa5e7f-0a47-4bb5-8b0d-e2119803a990	Quần Thể Thao Nam 7" Ultra Shorts-Quần short-Coolmate-Xanh dương	Xanh dương	["M", "XL", "XXL"]	100	2025-11-23 00:11:08.337589	2025-11-23 00:11:08.337589	#53709d	0
5058cc17-e34d-4af2-8323-53dd478dc46a	c9fa5e7f-0a47-4bb5-8b0d-e2119803a990	Quần Thể Thao Nam 7" Ultra Shorts-Quần short-Coolmate-Xám tro	Xám tro	["XL", "XXL"]	100	2025-11-23 00:11:08.337589	2025-11-23 00:11:08.337589	#7c7d89	0
90a8fb82-81ec-42e3-a9c6-631ba2373ba5	c9fa5e7f-0a47-4bb5-8b0d-e2119803a990	Quần Thể Thao Nam 7" Ultra Shorts-Quần short-Coolmate-Xanh navy	Xanh navy	["XL", "XXL"]	100	2025-11-23 00:11:08.337589	2025-11-23 00:11:08.337589	#58617b	0
54fb5cd9-7551-4516-b034-f39fcb795d97	ecb37d0b-6f27-4ee9-9209-5fbb6f19c900	Quần tây nam Hàn Quốc dáng baggy suông-Quần Âu - Ống suông-Vintino-Kem	Kem	["S", "M", "L", "XL"]	100	2025-11-23 00:11:41.787414	2025-11-23 00:11:41.787414	#C4BBAE	0
f88fca3c-33df-432c-aab6-fdafd9680653	25b54462-1033-4b54-9b0b-01584883b4c4	Quần nam Travel Shorts 7inch-Quần short-Coolmate-Xanh dương	Xanh dương	["M", "XL", "XXL"]	100	2025-11-23 00:12:49.937148	2025-11-23 00:12:49.937148	#4d82b0	0
4448a46f-bf8d-47b4-bb65-d66912b9a208	25b54462-1033-4b54-9b0b-01584883b4c4	Quần nam Travel Shorts 7inch-Quần short-Coolmate-Ghi	Ghi	["L", "XL", "XXL"]	100	2025-11-23 00:12:49.937148	2025-11-23 00:12:49.937148	#c8bfb3	0
bef4cd98-7bc8-4b25-b402-01a73c2a4fa0	25b54462-1033-4b54-9b0b-01584883b4c4	Quần nam Travel Shorts 7inch-Quần short-Coolmate-Đen	Đen	["L", "XL", "XXL"]	100	2025-11-23 00:12:49.937148	2025-11-23 00:12:49.937148	#4d4e51	0
a2c7b698-e937-47d8-b715-bba802eca5dc	0185afdd-daf1-4976-ab63-cf18e8a89e41	Quần âu nam sidetab ống suông-Quần Âu - Ống suông-Vintino-Be	Be	["S", "M", "L", "XL"]	100	2025-11-23 00:15:47.686064	2025-11-23 00:15:47.686064	#D9D3CA	0
f02c56e4-3ed4-4683-809e-89d44f30395c	0185afdd-daf1-4976-ab63-cf18e8a89e41	Quần âu nam sidetab ống suông-Quần Âu - Ống suông-Vintino-Ghi	Ghi	["S", "M", "L", "XL"]	100	2025-11-23 00:15:47.686064	2025-11-23 00:15:47.686064	#79797C	0
6ed2766f-9d78-4b79-a781-43007dde9e71	0185afdd-daf1-4976-ab63-cf18e8a89e41	Quần âu nam sidetab ống suông-Quần Âu - Ống suông-Vintino-Nâu	Nâu	["S", "M", "L", "XL"]	100	2025-11-23 00:15:47.686064	2025-11-23 00:15:47.686064	#5D4538	0
8505c51d-bb1f-4fa8-b16d-95711e36a950	0185afdd-daf1-4976-ab63-cf18e8a89e41	Quần âu nam sidetab ống suông-Quần Âu - Ống suông-Vintino-Đen	Đen	["S", "M", "L", "XL"]	100	2025-11-23 00:15:47.686064	2025-11-23 00:15:47.686064	#000000	0
1a7f4e0a-0a39-49a2-b723-12cd0bb1ebb1	3bd8a250-7654-4f7b-9a80-6fc050a67a3b	Ví nữ chần gập đôi-Ví nữ-SEEME-Kem	Kem	["KHÁC"]	100	2025-11-23 00:51:12.806888	2025-11-23 00:51:12.806888	#E8E6DC	0
b1834874-ede6-4220-b46e-3ea5023e7c2a	0185afdd-daf1-4976-ab63-cf18e8a89e41	Quần âu nam sidetab ống suông-Quần Âu - Ống suông-Vintino-Xanh than	Xanh than	["S", "M", "L", "XL"]	100	2025-11-23 00:15:47.686064	2025-11-23 00:15:47.686064	#171628	0
3607e94f-eed3-4a13-9d86-0d77ce469e94	0269d2c8-25d2-4b3a-9e9a-6baed2a5d87f	Quần Shorts Nam New French Terry V2-Quần short-Coolmate-Xám đậm	Xám đậm	["L", "XL"]	100	2025-11-23 00:16:06.504491	2025-11-23 00:16:06.504491	#818389	0
5e79cf63-d1b1-42ee-a302-488ad31df804	0269d2c8-25d2-4b3a-9e9a-6baed2a5d87f	Quần Shorts Nam New French Terry V2-Quần short-Coolmate-Xám nhạt	Xám nhạt	["XL", "XXL"]	100	2025-11-23 00:16:06.504491	2025-11-23 00:16:06.504491	#eef0f3	0
fdcadd56-cbaa-4bf0-bdf1-8677199506f5	7c4c1ba9-1370-468d-9543-e36d9bb5aeaf	Quần Shorts Thể Thao 5" Moving-Quần short-Lilywear-Trắng	Trắng	["L", "XL", "XXL"]	100	2025-11-23 00:18:08.975174	2025-11-23 00:18:08.975174	#e9e8e9	0
0b460e1c-dc7a-4671-ab7e-18d1d140717a	bb03c0a3-8447-4f80-b70f-adf1fceaade6	Quần Tây Nam VINTINO Cạp Cao-Quần Âu - Ống suông-Vintino-Ghi	Ghi	["S", "M", "L", "XL"]	100	2025-11-23 00:22:54.71008	2025-11-23 00:22:54.71008	#737A89	0
6c12f607-66d9-4d78-be16-0db41a6dff4d	bb03c0a3-8447-4f80-b70f-adf1fceaade6	Quần Tây Nam VINTINO Cạp Cao-Quần Âu - Ống suông-Vintino-Be	Be	["S", "M", "L", "XL"]	1	2025-11-23 00:22:54.71008	2025-11-23 00:22:54.71008	#D1C8B8	0
fa19d3b2-995c-4bf3-9426-7d9afff74595	bb03c0a3-8447-4f80-b70f-adf1fceaade6	Quần Tây Nam VINTINO Cạp Cao-Quần Âu - Ống suông-Vintino-Đen	Đen	["S", "M", "L", "XL"]	1	2025-11-23 00:22:54.71008	2025-11-23 00:22:54.71008	#000000	0
41e68c5c-c1a3-48bd-ac73-d71f3725fb58	9d2820dd-bfb6-4cdb-93ea-0e77a794b993	Áo sơ mi nam form rộng cổ chữ V dài tay-Áo sơ mi-Vintino-Trắng	Trắng	["M", "L", "XL"]	100	2025-11-23 00:25:01.008285	2025-11-23 00:25:01.008285	#ffffff	0
511abd0b-c6ea-45ea-b71d-99f3133d7b7d	2796f05d-c729-48bd-983e-8e3d48923fe2	Áo Sơ Mi Nam Dài Tay Vải Đũi-Áo sơ mi-Vintino-Ghi	Ghi	["M", "L", "XL"]	100	2025-11-23 00:28:35.78267	2025-11-23 00:28:35.78267	#ACB2BB	0
001dce9b-cdaa-487d-b3f5-13030b27f5e8	2796f05d-c729-48bd-983e-8e3d48923fe2	Áo Sơ Mi Nam Dài Tay Vải Đũi-Áo sơ mi-Vintino-Xanh rêu	Xanh rêu	["M", "L", "XL"]	100	2025-11-23 00:28:35.78267	2025-11-23 00:28:35.78267	#5F6157	0
1323d275-e643-483b-9f4d-1e5173639253	2796f05d-c729-48bd-983e-8e3d48923fe2	Áo Sơ Mi Nam Dài Tay Vải Đũi-Áo sơ mi-Vintino-Đỏ gạch	Đỏ gạch	["M", "L", "XL"]	100	2025-11-23 00:28:35.78267	2025-11-23 00:28:35.78267	#9E5E58	0
f20cb87d-c720-4671-9d7e-a8059bdf8778	90efd963-08cf-411e-a752-a9497f7eaaf1	Quần Jeans Nam siêu nhẹ-Quần short-Lilywear-Xanh đậm	Xanh đậm	["XL", "XXL"]	100	2025-11-23 00:29:57.359522	2025-11-23 00:29:57.359522	#3a424d	0
b3c97e6a-9179-4c9b-89d0-b178081e65b0	90efd963-08cf-411e-a752-a9497f7eaaf1	Quần Jeans Nam siêu nhẹ-Quần short-Lilywear-Xanh nhạt	Xanh nhạt	["L", "XL", "XXL"]	100	2025-11-23 00:29:57.359522	2025-11-23 00:29:57.359522	#5d728a	0
5e4a5740-2d0c-498f-b1db-3497326b9bc2	ebfd2ebf-e4ae-459b-be4d-c559f275548d	Áo sơ mi nhung tăm form suông-Áo sơ mi-Vintino-Đen	Đen	["S", "M", "L", "XL"]	100	2025-11-23 00:31:35.57746	2025-11-23 00:31:35.57746	#000000	0
7fdd9e81-05aa-4e4b-bb3f-89e0330009df	ebfd2ebf-e4ae-459b-be4d-c559f275548d	Áo sơ mi nhung tăm form suông-Áo sơ mi-Vintino-Ghi	Ghi	["S", "M", "L", "XL"]	100	2025-11-23 00:31:35.57746	2025-11-23 00:31:35.57746	#605D65	0
c09cefd1-5e61-413b-a0d5-97be049099d1	ebfd2ebf-e4ae-459b-be4d-c559f275548d	Áo sơ mi nhung tăm form suông-Áo sơ mi-Vintino-Xanh trend	Xanh trend	["S", "M", "L", "XL"]	100	2025-11-23 00:31:35.57746	2025-11-23 00:31:35.57746	#274646	0
14b618ed-f170-4d5d-8afd-88ebbdfb725f	004ca463-3862-4b7b-93a6-41e41250ecb7	Quần Jeans Nam Basics dáng Slim fit-Quần Jean-Coolmate-Đen	Đen	["XL", "XXL"]	100	2025-11-23 00:32:23.994276	2025-11-23 00:32:23.994276	#3e3d40	0
59d47bfa-c5cc-42ce-a5d6-b7c8a725d911	004ca463-3862-4b7b-93a6-41e41250ecb7	Quần Jeans Nam Basics dáng Slim fit-Quần Jean-Coolmate-Xanh đậm	Xanh đậm	["XL", "XXL"]	100	2025-11-23 00:32:23.994276	2025-11-23 00:32:23.994276	#425568	0
d4a9b595-8ad0-4489-88ab-1096432e9bc7	004ca463-3862-4b7b-93a6-41e41250ecb7	Quần Jeans Nam Basics dáng Slim fit-Quần Jean-Coolmate-Đen wash	Đen wash	["XL", "XXL"]	100	2025-11-23 00:32:23.994276	2025-11-23 00:32:23.994276	#4a494d	0
04d15922-cf76-4c5d-b27d-ec11ca9d1e37	3c323421-accb-4dd9-a288-aad9a577fe1f	Quần Dài Ống Rộng Form Suông-Quần ống rộng-Vintino-Đen	Đen	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:34:52.374476	2025-11-23 00:34:52.374476	#000000	0
e4e4da91-b32b-4539-98f8-4c2bd33e1624	3c323421-accb-4dd9-a288-aad9a577fe1f	Quần Dài Ống Rộng Form Suông-Quần ống rộng-Vintino-Trắng	Trắng	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:34:52.374476	2025-11-23 00:34:52.374476	#ffffff	0
4083d369-2bcd-47e4-9fad-1c106124b4ba	3c323421-accb-4dd9-a288-aad9a577fe1f	Quần Dài Ống Rộng Form Suông-Quần ống rộng-Vintino-Xám đậm	Xám đậm	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:34:52.374476	2025-11-23 00:34:52.374476	#D8D5CE	0
800be56d-1c4a-47e2-b94b-3278c9c28bbc	3c323421-accb-4dd9-a288-aad9a577fe1f	Quần Dài Ống Rộng Form Suông-Quần ống rộng-Vintino-Xám nhạt	Xám nhạt	["S", "M", "L", "XL", "XXL"]	100	2025-11-23 00:34:52.374476	2025-11-23 00:34:52.374476	#D2CAB8	0
35cd4bf6-32da-48e8-9097-b230640eed52	a91d7f6d-2c7a-4195-9a6f-09bf59bfe297	Quần Jeans Nam Copper Denim OG Slim-Quần Jean-Coolmate-Xanh nhạt	Xanh nhạt	["XS", "M", "XXL"]	100	2025-11-23 00:35:15.267421	2025-11-23 00:35:15.267421	#95a8ba	0
559a743b-f0bc-4797-9b3d-3abb89585960	56d7a427-f2f8-41f4-a6b3-b87ed794b8eb	Quẩn Kẻ Caro Ống Rộng-Quần ống rộng-Vintino-Đen	Đen	["S", "M", "L", "XL"]	100	2025-11-23 00:36:46.85999	2025-11-23 00:36:46.85999	#000000	0
d08e1ecf-a7a3-4032-9ad0-94c766c7ec45	56d7a427-f2f8-41f4-a6b3-b87ed794b8eb	Quẩn Kẻ Caro Ống Rộng-Quần ống rộng-Vintino-Xanh	Xanh	["S", "M", "L", "XL"]	100	2025-11-23 00:36:46.85999	2025-11-23 00:36:46.85999	#66666D	0
752b8b1a-d9e3-44b1-b544-7b8b3826bfbd	56d7a427-f2f8-41f4-a6b3-b87ed794b8eb	Quẩn Kẻ Caro Ống Rộng-Quần ống rộng-Vintino-Nâu	Nâu	["S", "M", "L", "XL"]	1	2025-11-23 00:36:46.85999	2025-11-23 00:36:46.85999	#746961	0
96a74a2d-6cdc-43b2-9cdc-6125f611d3d4	b498eac7-3002-41e0-bbe6-f0c7763bee25	Quần Jeans Nam Denim Slim Fit-Quần Jean-Coolmate-Xanh nhạt	Xanh nhạt	["M", "L", "XL"]	100	2025-11-23 00:38:56.081344	2025-11-23 00:38:56.081344	#5d7083	0
95d20cfb-1000-434a-8519-2e3b11c52c0a	226b4097-287d-4610-897a-3e641f477af5	Quần Dài Baggy Kaki Ống Suông-Quần ống rộng-Vintino-Đen	Đen	["S", "M", "L", "XL"]	100	2025-11-23 00:41:20.722408	2025-11-23 00:41:20.722408	#000000	0
67a975fe-6fa4-42c5-86fc-12c59c8caae4	226b4097-287d-4610-897a-3e641f477af5	Quần Dài Baggy Kaki Ống Suông-Quần ống rộng-Vintino-Trắng	Trắng	["S", "M", "L", "XL"]	100	2025-11-23 00:41:20.722408	2025-11-23 00:41:20.722408	#ffffff	0
ddba209c-17a5-458b-90e1-c5a0c1c16aec	226b4097-287d-4610-897a-3e641f477af5	Quần Dài Baggy Kaki Ống Suông-Quần ống rộng-Vintino-Be	Be	["S", "M", "L", "XL"]	1	2025-11-23 00:41:20.722408	2025-11-23 00:41:20.722408	#EBE1D7	0
cb96ae57-1335-4060-8d29-e4c045e7fdfe	226b4097-287d-4610-897a-3e641f477af5	Quần Dài Baggy Kaki Ống Suông-Quần ống rộng-Vintino-Xanh rêu	Xanh rêu	["S", "M", "L", "XL"]	1	2025-11-23 00:41:20.722408	2025-11-23 00:41:20.722408	#69643B	0
45c37b02-43e9-437a-8946-ccc6602d91ca	ef0c3952-509c-4f61-8bcb-7f7b8d860ca9	Quần Nỉ Nam Ống Suông Rộng Thể Thao-Quần ống rộng-Vintino-Đen	Đen	["S", "M", "L", "XL"]	100	2025-11-23 00:43:56.515619	2025-11-23 00:43:56.515619	#000000	0
552ee7f7-5b89-470b-b99c-8a993e0330c7	ef0c3952-509c-4f61-8bcb-7f7b8d860ca9	Quần Nỉ Nam Ống Suông Rộng Thể Thao-Quần ống rộng-Vintino-Trắng	Trắng	["S", "M", "L", "XL"]	100	2025-11-23 00:43:56.515619	2025-11-23 00:43:56.515619	#ffffff	0
ae8a9c37-037d-4bc6-b3b6-ebece2e75794	ef0c3952-509c-4f61-8bcb-7f7b8d860ca9	Quần Nỉ Nam Ống Suông Rộng Thể Thao-Quần ống rộng-Vintino-Xám đậm	Xám đậm	["S", "M", "L", "XL"]	100	2025-11-23 00:43:56.515619	2025-11-23 00:43:56.515619	#D4D4D8	0
148041b9-e87e-46d5-840f-ba187bf82a7f	ef0c3952-509c-4f61-8bcb-7f7b8d860ca9	Quần Nỉ Nam Ống Suông Rộng Thể Thao-Quần ống rộng-Vintino-Xám nhạt	Xám nhạt	["S", "M", "L", "XL"]	100	2025-11-23 00:43:56.515619	2025-11-23 00:43:56.515619	#E2E1E6	0
52308c2f-1727-4a13-9e07-c4c7dbe021b6	3414bfb8-ec3b-46c6-95ea-445567e05e72	Ví đựng tiền mini dáng ngắn-Ví nữ-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 00:48:51.617926	2025-11-23 00:48:51.617926	#000000	0
43bb1977-85ac-4879-9ccf-330cf13c78d5	3414bfb8-ec3b-46c6-95ea-445567e05e72	Ví đựng tiền mini dáng ngắn-Ví nữ-SEEME-Kem	Kem	["KHÁC"]	100	2025-11-23 00:48:51.617926	2025-11-23 00:48:51.617926	#D8CFC9	0
6fd1ee6d-ff9b-4055-bcbb-c44bc80e0b6f	3414bfb8-ec3b-46c6-95ea-445567e05e72	Ví đựng tiền mini dáng ngắn-Ví nữ-SEEME-Jeans	Jeans	["KHÁC"]	100	2025-11-23 00:48:51.617926	2025-11-23 00:48:51.617926	#A9B5BD	0
b8013dc4-41d9-4b05-9431-69fec87f4939	3bd8a250-7654-4f7b-9a80-6fc050a67a3b	Ví nữ chần gập đôi-Ví nữ-SEEME-Jeans	Jeans	["KHÁC"]	100	2025-11-23 00:51:12.806888	2025-11-23 00:51:12.806888	#B2C1CD	0
3e6050b4-9993-4737-840a-6d632d98ff5e	3bd8a250-7654-4f7b-9a80-6fc050a67a3b	Ví nữ chần gập đôi-Ví nữ-SEEME-Bạc	Bạc	["KHÁC"]	100	2025-11-23 00:51:12.806888	2025-11-23 00:51:12.806888	#D8DBE0	0
de0a4a43-bec4-47d6-a27d-46f86237bf72	47af250b-ee4a-4bb5-800a-b0ff439492ad	Ví đựng tiền mini gập ba-Ví nữ-SEEME-Hồng	Hồng	["KHÁC"]	100	2025-11-23 00:54:13.035076	2025-11-23 00:54:13.035076	#DCB5AA	0
de81c708-e3dd-4492-9a2f-49e3c3fb1296	47af250b-ee4a-4bb5-800a-b0ff439492ad	Ví đựng tiền mini gập ba-Ví nữ-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 00:54:13.035076	2025-11-23 00:54:13.035076	#000000	0
b893d9ff-bb80-4dc2-afae-183cebde1105	47af250b-ee4a-4bb5-800a-b0ff439492ad	Ví đựng tiền mini gập ba-Ví nữ-SEEME-Be	Be	["KHÁC"]	100	2025-11-23 00:54:13.035076	2025-11-23 00:54:13.035076	#F4EBE0	0
f8829a68-e5f8-46e5-b824-96b9950376e1	47af250b-ee4a-4bb5-800a-b0ff439492ad	Ví đựng tiền mini gập ba-Ví nữ-SEEME-Jeans	Jeans	["KHÁC"]	100	2025-11-23 00:54:13.035076	2025-11-23 00:54:13.035076	#BBC1CD	0
b2e116b8-1426-4af4-ba08-b5631daeaf2b	47af250b-ee4a-4bb5-800a-b0ff439492ad	Ví đựng tiền mini gập ba-Ví nữ-SEEME-Vàng	Vàng	["KHÁC"]	100	2025-11-23 00:54:13.035076	2025-11-23 00:54:13.035076	#FBE9C7	0
d1617ec5-f9c1-4616-95b2-9869b8af6ceb	16fac00e-9179-4156-8df3-2524f85512cf	Ví đựng tiền nữ cầm tay hình chữ nhật-Ví nữ-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 00:55:49.769315	2025-11-23 00:55:49.769315	#000000	0
a054a5c2-50a9-4ae3-a3c1-1ef95a1a7565	16fac00e-9179-4156-8df3-2524f85512cf	Ví đựng tiền nữ cầm tay hình chữ nhật-Ví nữ-SEEME-Be	Be	["KHÁC"]	100	2025-11-23 00:55:49.769315	2025-11-23 00:55:49.769315	#E1DCCF	0
7bfbb38a-6b74-45e3-b56d-595dcbcd3d8d	16fac00e-9179-4156-8df3-2524f85512cf	Ví đựng tiền nữ cầm tay hình chữ nhật-Ví nữ-SEEME-Jeans	Jeans	["KHÁC"]	100	2025-11-23 00:55:49.769315	2025-11-23 00:55:49.769315	#91A4AD	0
7edfe531-3741-485a-94ed-50c595d36bd2	bb585dc8-9dc7-42cc-a532-ac4d1c092a9a	Ví nữ mini đính đá đeo chéo-Ví nữ-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 00:57:48.192003	2025-11-23 00:57:48.192003	#000000	0
d55269c8-375d-4052-afa8-ea733436e67b	bb585dc8-9dc7-42cc-a532-ac4d1c092a9a	Ví nữ mini đính đá đeo chéo-Ví nữ-SEEME-Be	Be	["KHÁC"]	100	2025-11-23 00:57:48.192003	2025-11-23 00:57:48.192003	#FCF4E7	0
55ba0325-1483-49ab-a8fd-755d821bd98c	a293c53b-0d41-4fa9-a158-49a13295d5c1	Túi kẹp nách nữ cao cấp phối xích-Túi xách-SEEME-Be	Be	["KHÁC"]	100	2025-11-23 01:00:35.297237	2025-11-23 01:00:35.297237	#F3EAE0	0
8042006c-5c33-43e7-9e96-45ad1429c69c	a293c53b-0d41-4fa9-a158-49a13295d5c1	Túi kẹp nách nữ cao cấp phối xích-Túi xách-SEEME-Nâu	Nâu	["KHÁC"]	100	2025-11-23 01:00:35.297237	2025-11-23 01:00:35.297237	#9B7466	0
88c8ec46-8525-4d39-b74f-6e839d970d59	a293c53b-0d41-4fa9-a158-49a13295d5c1	Túi kẹp nách nữ cao cấp phối xích-Túi xách-SEEME-Jeans	Jeans	["KHÁC"]	100	2025-11-23 01:00:35.297237	2025-11-23 01:00:35.297237	#B1CADD	0
83605c0c-17b5-4882-b040-7fe0d40aafef	bcfed53f-a779-466d-94e9-b631b4617993	Túi kẹp nách đeo chéo da chần-Túi xách-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 01:02:46.833306	2025-11-23 01:02:46.833306	#000000	0
f83360c3-4655-4134-84d0-586ef60edc3c	bcfed53f-a779-466d-94e9-b631b4617993	Túi kẹp nách đeo chéo da chần-Túi xách-SEEME-Be	Be	["KHÁC"]	100	2025-11-23 01:02:46.833306	2025-11-23 01:02:46.833306	#F5F0E8	0
e42b2a4b-0d18-41cc-8f0e-4a1d585db23d	bcfed53f-a779-466d-94e9-b631b4617993	Túi kẹp nách đeo chéo da chần-Túi xách-SEEME-Bạc	Bạc	["KHÁC"]	100	2025-11-23 01:02:46.833306	2025-11-23 01:02:46.833306	#F6F4F5	0
6380b6ac-5437-4ee0-9612-2744973279e1	bcc9da9b-b798-4636-b48f-5af85cb8381e	Túi kẹp nách đeo chéo nữ cao cấp-Túi xách-SEEME-Be	Be	["KHÁC"]	100	2025-11-23 01:04:28.525169	2025-11-23 01:04:28.525169	#E9DCD1	0
bc29bd4e-09f3-4ee8-afa8-0855e115c2c2	bcc9da9b-b798-4636-b48f-5af85cb8381e	Túi kẹp nách đeo chéo nữ cao cấp-Túi xách-SEEME-Jeans	Jeans	["KHÁC"]	100	2025-11-23 01:04:28.525169	2025-11-23 01:04:28.525169	#C3D3E7	0
17704818-84e8-4b26-a3a4-cb5015d8ab5d	06e25602-2755-4509-a9ad-bd5d50417304	Túi xách nữ đeo chéo dây xích da sần-Túi xách-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 01:05:36.061373	2025-11-23 01:05:36.061373	#000000	0
8098b9d9-5763-4818-b4e5-2692fad5738c	242937f2-bccf-4371-a328-529b29be7fa9	Túi đeo chéo phong cách Hàn Quốc phối khoá vàng-Túi xách-SEEME-Đen	Đen	["KHÁC"]	100	2025-11-23 01:06:51.794979	2025-11-23 01:06:51.794979	#000000	0
69044697-f24a-4e02-9d61-777681f6e610	9d2820dd-bfb6-4cdb-93ea-0e77a794b993	Áo sơ mi nam form rộng cổ chữ V dài tay-Áo sơ mi-Vintino-Đen	Đen	["M", "L", "XL"]	99	2025-11-23 00:25:01.008285	2025-11-25 10:36:15.383762	#000000	1
6718d8ce-0fbe-4e62-94db-e3c70c5869fb	ecb37d0b-6f27-4ee9-9209-5fbb6f19c900	Quần tây nam Hàn Quốc dáng baggy suông-Quần Âu - Ống suông-Vintino-Ghi	Ghi	["S", "M", "L", "XL"]	99	2025-11-23 00:11:41.787414	2025-11-25 10:36:15.383762	#8D8E90	1
ce8e30c1-d30e-42aa-aed3-9fed3006b4c8	f30d900c-fceb-4e89-961c-ac81e02530a1	Ví Da REX-Ví Nam-UNDERTHINKER-Đen	Đen	["KHÁC"]	99	2025-11-22 01:30:26.989601	2025-11-25 10:36:15.383762	#000000	1
bf3fa4ec-f9d8-4fe8-92d9-d383b272b74c	6e0e4f2a-3c49-4b89-b82f-cc2d1a127690	Áo Khoác Bomber Dù Hai Lớp-Áo Varsity - Bomber-Vintino-Xám	Xám	["M", "L", "XL"]	99	2025-11-22 23:37:08.018804	2025-11-25 10:36:15.383762	#706F72	1
6773469f-5821-4a4b-b640-efd57f2ca2bf	ecb37d0b-6f27-4ee9-9209-5fbb6f19c900	Quần tây nam Hàn Quốc dáng baggy suông-Quần Âu - Ống suông-Vintino-Đen	Đen	["S", "M", "L", "XL"]	99	2025-11-23 00:11:41.787414	2025-11-25 10:44:00.867061	#000000	1
3512b12e-82bf-41e0-8d04-f951e5ca9c88	c2647feb-38af-4b08-ba71-8ae485eee874	Áo Khoác Gió Nam Nữ 2 lớp Windbreaker-Áo Hoodie - Sweater-Teelab-Đen	Đen	["M", "L", "XL"]	96	2025-11-22 02:21:16.343086	2025-11-25 10:47:45.60688	#000000	4
b3c45334-3752-42f1-adad-4a2e4f78028d	5948ad05-3969-43c8-bc89-be43117c2282	Áo Hoodie Zip Form Rộng-Áo Hoodie - Sweater-Vintino-Xám nhạt	Xám nhạt	["M", "L", "XL"]	98	2025-11-22 23:43:43.097149	2025-11-25 14:06:21.795085	#8C8585	2
9817634d-ad5f-4fc3-b31b-d1c46565a7c2	39e16012-3a4b-4991-b6e1-86ea9e27f7d1	Áo hoodie ninja cao cổ Ver 2-Áo Hoodie-Zonef-Đen	Đen	["M", "L", "XL"]	98	2025-11-21 21:18:50.394407	2025-11-25 14:12:55.495488	#000000	2
\.


--
-- TOC entry 5353 (class 0 OID 17352)
-- Dependencies: 290
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, name, description, category_id, supplier_id, status, created_at, updated_at, price, sale_percent, is_flash_sale, sequence_id) FROM stdin;
e195f30f-180a-4ca1-9cd3-aed5b35f7889	Quần Ống Rộng Cạp Chun Nam vải Tuyết Mưa	Chất vải: Vải tuyết mưa Hàn Quốc dày dặn đàn hồi và co dãn nhẹ, mặt vải mềm mướt không xù lông, mặc thoải mái thoáng mát.\nCạp quần : Chun cạp may dạng bản rộng mặc ôm người, không gây khó chịu hằn da, có dây buộc chắc chắn.	153ed4d5-a042-4f74-81c9-1cb17aa76861	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:55:03.188831	2025-11-21 21:55:03.188831	129000.00	0.00	f	12
b486bb46-094f-4e92-9543-fb12aaa640fc	Túi Đeo Vai Nữ Quai Xích Lea Chain HAPAS	✪ Kiểu dáng HOT TREND\n\n✪ Thiết kế trẻ trung, hiện đại, đường may tỉ mỉ, chắc chắn.\n\n✪ Chất da PU cao cấp, độc quyền, mềm mịn, bền đẹp, chống bong chóc, chống thấm nước.\n\n✪ Ví đeo chéo, dây kim loại có nhiều ngăn để đựng, thẻ, đồ trang điểm...rất tiện dụng và linh hoạt.	d9d08d20-b12f-4abe-8147-5810e758e7ac	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:01:51.62576	2025-11-21 22:01:51.62576	1083000.00	0.00	f	13
508ad9d2-9ba1-40fe-83b7-88d6a829a6bb	Áo Sweater Nam Phối Sơ Mi	Áo Sweater Nam Nữ ZONEF OFFICIAL Phối Sơ Mi Kẻ Xanh Nhạt Liền Thân Chất Nỉ 2 Da ANT\n- Chất liệu: vải nỉ 2 da mềm mại, bề mặt mềm mịn, không bai, không xù, không nhăn\n- Áo thiết kế độc đáo có cổ áo và tay áo phối sơ mi mang lại sự trẻ trung, lịch thiệp cho người mặc\n- Áo dễ phối đò cho cả nam và nữ	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 20:22:17.536819	2025-11-21 20:22:28.517569	159000.00	20.00	f	2
ed97bb82-d6f9-4100-9d97-9fd3e5130808	Áo Sơ Mi Nam Ngắn Tay Phối Cà Vạt Oversize	- Cà vạt có thể tháo rời, mặc được 2 kiểu, linh động phối đồ.\n- Chất liệu vải chéo hàn thoáng mát và co giãn tốt, những sản phẩm bằng vải chéo hàn thông thường giữ form dáng rất là tốt khi sử dụng xong, chỉ cần chúng ta xử lý nhẹ qua là treo áo lên thì form áo sẽ không bao giờ mất\n- Thiết kế cách điệu, basic, trẻ trung, phong cách hàn quốc\n- Dễ dàng phối đồ, khoác ngoài mà không gây bí bách, nóng nực\n- Sản phẩm có độ hoàn thiện cao, đường kim mũi chỉ khâu máy chắc chắn, tỉ mỉ.	61fd3769-9276-4155-a6e7-3af4343ba5e0	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:14:18.816246	2025-11-21 21:14:18.816246	129000.00	0.00	f	4
39e16012-3a4b-4991-b6e1-86ea9e27f7d1	Áo hoodie ninja cao cổ Ver 2	- Thiết kế cúc bấm, kiểu dáng ninja điểm nhấn là ở cổ áo cao giữ nhiệt\n- Chất liệu nỉ da siêu dày dặn, giữ ấm cực kỳ tốt\n- Form rộng, phù hợp cho cả nam và nữ	c53c187a-2559-48aa-96a2-d1430eba1597	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:18:50.394407	2025-11-21 21:18:50.394407	299000.00	0.00	f	5
1ef6a49e-4a10-446f-a60a-fd2307a5423d	Áo Thun Trơn Phối Vạt Trước	Chất liệu cotton thoáng mát mang lại cảm giác dễ chịu cho người mặc\nPhụ kiện inox: Điểm nhấn đặc biệt của sản phẩm là phần inox được phối hợp 1 cách tinh tế và phong cách\nĐường may tỉ mỉ, chắc chắn, không xù ko phai màu ko bai, ...\nPhong cách trẻ trung, năng động phù hợp với đi làm, đi chơi, chơi thể thao,	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:24:08.319717	2025-11-21 21:24:08.319717	148999.00	0.00	f	6
ca60a8d3-00d8-4125-92ca-3f5219959851	Áo Thun Sweater Dài Tay Form Rộng Unisex	Áo thun tay dài dáng rộng Unisex nhà ZoneF\n- Sử dụng chất liệu Cá sấu dày dặn, hạn chế nhăn, bề mặt vải mịn. \n- Unisex, form rộng, dáng suông. \n- Form Regular trẻ trung năng động bất chấp khi diện với các thể loại quần như quần tây, quần shorts,...	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:27:09.13702	2025-11-21 21:27:09.13702	209000.00	0.00	f	7
57fc66fe-d83a-41d6-9800-5c7a1541d4ab	Quần Nỉ Ống Cong Phối Dây Thừng	Form ống cong dáng rộng unisex. Ống quần rộng thụng, dáng cong tạo hiệu ứng phồng tự nhiên, che khuyết điểm chân.\nCạp chun co giãn vừa vặn tạo cảm giác thoải mái khi mặc, dây rút dài vừa dễ điều chỉnh vừa có thể là điểm nhấn nếu để buông. Hai đường line ẩn vừa tạo điểm nhấn vừa mêm mại vừa phong cách làm cho chiếc quần nổi bật hơn.\nĐường may chắc chắn tỉ mỉ, có thể giặt tay giặt máy đều được.\nChất liệu nỉ ép Hàn cao cấp: Giữ ấm tốt – chống nhăn – ít xù lông. Đây là item unisex, nam nữ đều có thể mặc, cực hợp đi học, đi chơi, dạo phố hoặc mix cùng hoodie, sweater, áo phông oversize.	b1017d62-8275-41c0-b79b-3d8659ada027	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:33:23.841721	2025-11-21 21:33:23.841721	159000.00	0.00	f	8
5e8b15d6-2a08-4acd-a57a-3ccc364973c1	Quần Vải Kaki Dù Xếp Ly Ống Rộng	Quần kaki From rộng, quần thời trang unisex\n+ Dộ dài quần vừa phải, chất lượng và đồ hoàn thiện tốt mang lại cảm giác thỏa mái khi mặc\n+ Độ co gian nhẹ, tạo cảm giác thỏa mái khi vận động.\n+ Độ bền cao: vải có thể giăt được nhiều lần mà không hề bị hỏng, có thể sử dụng trong thời gian dài.	b1017d62-8275-41c0-b79b-3d8659ada027	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:41:31.818654	2025-11-21 21:41:31.818654	159000.00	0.00	f	9
5d1b2d2b-a691-475e-94bb-17e92f9f2c60	Quần Jean Nam Loang Rách	Chất liệu: Jean, denim, ...\nKiểu dáng: Form rộng, cạp cúc \nQuần được thiết kế với đường floating line làm điểm nhấn cho chiếc quần thêm nổi bật, Những đường line này ko chỉ giúp trang trí mà còn giúp bạn có phong cách hơn, có gu thời trang hơn...\nPhong cách hiện đại, đơn giản phù hợp đi chơi, đi làm	bfad29e9-032c-4498-b70c-eaac37162870	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:46:43.490298	2025-11-21 21:46:43.490298	179000.00	0.00	f	10
88f9f1e2-dfa6-4119-9c79-f64e04dba2d5	Quần Jean Nam Suông Ống Rộng	Chất liệu: Jean mềm\nForm rộng giúp che khuyết điểm chân như: chân to, chân bé, cong,...\nHack dáng - Tạo cho người mặc dáng cao hơn bình thường\nCạp chun co giãn 4 chiều - Đem lại cảm giác thoải mái khi mặc	bfad29e9-032c-4498-b70c-eaac37162870	03f8f07a-58f7-4cfe-9041-60fbc676ed46	active	2025-11-21 21:50:40.281175	2025-11-21 21:50:40.281175	179000.00	0.00	f	11
b93e9113-141c-46fd-b95e-36bf16e69391	Túi Xách Nữ Hobo Đáy Vuông	Dáng túi hình thang, form cứng cáp\nPhụ kiện cao cấp, đường may sắc nét\nĐiểm nhấn keychain ví mini hình trái tim\nNgăn chứa rộng rãi chứa được nhiều đồ	6c6d9548-4b93-4534-a70b-b28d98f00ce8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:11:14.051333	2025-11-21 22:11:14.051333	1029000.00	0.00	f	14
882f88a5-9a17-4218-a4d8-ade7667c088a	Túi Đeo Vai Hobo Nắp Gập	Logo kim loại dập chìm tinh tế sắc nét\nPhụ kiện cao cấp, đường may sắc nét\nKiểu dáng đơn giản, hiện đại\nNgăn chứa rộng, chứa được nhiều đồ\nChất liệu : Da PU cao cấp, da mịn dễ vệ sinh	d9d08d20-b12f-4abe-8147-5810e758e7ac	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:16:29.907234	2025-11-21 22:16:29.907234	1199000.00	0.00	f	15
0da4fd99-5be0-4172-8a21-7d3bd9e9c28f	Túi Xách Nữ Công Sở Cao Cấp	Chất liệu : da PU cao cấp, da PU mịn dễ vệ sinh  \nTúi thiết kế sang trọng, thanh lịch\nPhối phụ kiện kim loại dập chìm tinh tế\nChất liệu da không bay màu, bền bỉ theo thời gian	6c6d9548-4b93-4534-a70b-b28d98f00ce8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:20:40.996372	2025-11-21 22:20:40.996372	1189000.00	0.00	f	16
c271b54d-5da5-4738-9ffa-1d20995feee5	Bộ Quà Tặng Tidy	Set Quà Kèm Charm Tặng Người Thương\nTrẻ trung, cá tính\nPhù hợp với mọi lứa tuổi\nMàu sắc basic dễ phối đồ\nPhù hợp với đi chơi, đi du lịch	90527a4b-4c56-431d-bcf2-5909223e41d8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:27:17.141331	2025-11-21 22:27:17.141331	1139000.00	0.00	f	17
7885e516-1b25-4f4f-a446-c079b57f7841	Bộ Quà Tặng Túi Xách "Yêu Chiều"	Bộ Set Quà Túi Xách Cao Cấp Dành Cho Bạn Gái, Người Thương, hộp Quà Tặng Đặc Biệt Mùa Valentine 14.2\nThiết kế tinh tế, cao cấp với 2 set túi ví và nước hoa, đa dạng lựa chọn dành cho người thương	90527a4b-4c56-431d-bcf2-5909223e41d8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:31:45.50833	2025-11-21 22:31:45.50833	1830000.00	0.00	f	18
20f7bdde-110c-42c3-ab60-a4d4b4183129	Túi Xách Nữ Đai Ngang	Trẻ trung, cá tính\nPhù hợp với mọi lứa tuổi\nMàu sắc basic dễ phối đồ\nPhù hợp với đi chơi, đi du lịch	6c6d9548-4b93-4534-a70b-b28d98f00ce8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:35:36.208679	2025-11-21 22:35:36.208679	999000.00	0.00	f	19
cb28b0fe-77be-4b55-b590-8100f3d0ff66	Túi Xách Hobo Dập Nổi Line Embossed Jeans	Trẻ trung, cá tính\nPhù hợp với mọi lứa tuổi\nMàu sắc basic dễ phối đồ\nPhù hợp với đi chơi, đi du lịch	6c6d9548-4b93-4534-a70b-b28d98f00ce8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:38:01.505441	2025-11-21 22:38:01.505441	799000.00	0.00	f	20
66db372f-ef45-457b-b706-4300043987e7	Túi Giấy Đựng Quà Tặng Cao Cấp	Túi đựng quà tặng độc quyền của Hapas	6c6d9548-4b93-4534-a70b-b28d98f00ce8	6f9db9da-e2f3-4a55-94f6-c265c8b42849	active	2025-11-21 22:40:08.204808	2025-11-21 22:40:08.204808	45000.00	0.00	f	21
a55a54c4-52b1-410e-b9ec-f7afbcee916f	Túi đeo vai nữ LESAC	Túi xách LESAC với thiết kế hobo mini trẻ trung, chất liệu vải jacquard họa tiết logo tinh tế. Điểm nhấn là chi tiết khóa kim loại và quai đeo đa năng (đeo vai hoặc đeo chéo). Phù hợp phối đồ hàng ngày, có 3 màu thanh lịch: Đen - Kem nhạt - Xanh pastel. Nhỏ gọn nhưng vẫn đủ chứa điện thoại, ví và các vật dụng cá nhân thiết yếu.	6c6d9548-4b93-4534-a70b-b28d98f00ce8	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 00:40:49.484457	2025-11-22 00:40:49.484457	449000.00	0.00	f	22
0a51eacc-eba4-41cf-8ec2-8f50fbaec231	Túi đeo vai nữ LESAC	Chloe Bag Bag là túi đeo vai da PU mềm với 3 màu: Đen, Trắng, Latte\n• Hoạ tiết: Một màu, da PU mềm\n• Kích thước: 24 x 8 x 7cm\n• Túi khoá có ngăn to chính với khoá kéo, túi đi kèm tag có logo thương hiệu.	d9d08d20-b12f-4abe-8147-5810e758e7ac	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 00:43:53.292088	2025-11-22 00:43:53.292088	465000.00	0.00	f	23
df18b151-0c8e-45a9-996e-e5a390c6c36b	Túi mini đeo chéo nữ LESAC	Mirri Bag là túi mini đeo chéo/ xách tay da PU mềm với 5 màu: Hồng nhạt (Baby Pink), Đen (Black), Trắng (White), Blue, Yellow\nThông tin sản phẩm\n• Hoạ tiết: Một màu, da PU mềm\n• Kích thước: 18x11x6.5cm	6c6d9548-4b93-4534-a70b-b28d98f00ce8	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 00:47:23.979128	2025-11-22 00:47:23.979128	344000.00	0.00	f	24
21614097-a4f1-4478-94dd-bc5814781390	Túi xách nữ LESAC Mikala Bag	Túi xách nữ LESAC Mikala Bag (2 colors)\nMikala Bag là túi đeo chéo da PU sần với 2 màu: Đen, Milky.\nTrân trọng những vẻ đẹp tự nhiên nhất của khách hàng, LESAC mong muốn mang lại sự tự tin trong từng chiếc túi xách được thiết kế đặc biệt cho phái nữ.\nThông tin sản phẩm \n• Kích thước: 22 x 15 x 8cm\n• Chất liệu: Da PU sần lì chắc chắn\n• Phù hợp để sử dụng: Đi làm, đi chơi, dạo phố	6c6d9548-4b93-4534-a70b-b28d98f00ce8	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 00:52:03.178157	2025-11-22 00:52:03.178157	544000.00	0.00	f	25
9916b12c-1aed-4559-a137-831ba0a7a135	Ví nữ mini LESAC Nina Wallet	Nina Wallet là ví da PU trơn, ví thẻ đeo cổ\nTrân trọng những vẻ đẹp tự nhiên nhất của khách hàng, LESAC mong muốn mang lại sự tự tin trong từng chiếc túi xách được thiết kế đặc biệt cho phái nữ.\nThông tin sản phẩm\n• Hoa Văn, Chi Tiết: Ví thẻ đeo cổ\n• Kích thước: 12 x 8cm | dây đeo - 43cm\n• Chất liệu: Da PU\n• Màu sắc: Đen - Milky - Đỏ	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 00:58:54.662991	2025-11-22 00:58:54.662991	149000.00	0.00	f	26
10dda6b6-0dc6-4275-bfaf-79d42b4f3981	Ví nữ mini LESAC Stand Wallet	Thông tin sản phẩm\n• Hoa Văn, Chi Tiết: Basic, thanh lịch\n• Kích thước: 14 x 10 x 2cm\n• Kiểu khóa: Khóa kéo\n• Chất liệu: Da PU sần nhẹ,chắc chắn\n• Kích cỡ: Trung bình\n• Phù hợp để sử dụng: Đi làm, đi chơi, dạo phố	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 01:01:33.500018	2025-11-22 01:01:33.500018	189000.00	0.00	f	27
f71f0055-6d01-48e4-8f8c-a66f252beee5	Ví nữ mini LESAC	Thông tin sản phẩm\n• Hoa Văn, Chi Tiết: Basic, thanh lịch, ví gập, có khoá \n• Kích thước: 11,2 x 8,5 x 2cm\n• Chất liệu: Da PU\n• Màu sắc: Đen - Trắng - Bạc	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	15cc9677-b31e-4190-98a9-fb3c6ad713de	active	2025-11-22 01:07:55.451212	2025-11-22 01:07:55.451212	158999.00	0.00	f	28
8d2f3138-d789-49d5-9685-700010cef9c2	Gọng kính cận nữ oval	* Bộ sản phẩm Kính Cận Lily Eyewear gồm:\n+ Hộp đựng kính mắt Lily.\n+ Khăn lau kính mắt.\n* Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n* Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:11:22.811508	2025-11-22 01:11:22.811508	159.00	0.00	f	29
80a4194a-c8d5-44f8-ac7e-4b540eb2f36b	Ví Da Nam Monogram AMOUR	- Chất liệu: Da PU cao cấp \n- Màu sắc: Đen \n- Kích thước: 23cm x 9cm x 2cm\nSản phẩm ví da PU cao cấp của thương hiệu được thiết kế với các ngăn đựng được tối ưu hóa để đáp ứng nhu cầu lưu trữ của khách hàng. Bên trong ví sở hữu 1 ngăn chính lớn có sức chứa lớn, cùng với 3 ngăn phụ đựng thẻ.	5ca01ef3-1557-44b2-96b7-e99fc6a489ea	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:12:22.467824	2025-11-22 01:12:22.467824	205000.00	0.00	f	30
d575be52-133b-41d9-9039-8e67b038fa06	Ví Da Nam SOLAR Monogram	Họa tiết monogram sang trọng và chất liệu da nhân tạo cao cấp được chọn lựa kỹ lưỡng, thân thiện với động vật, giúp tạo nên sản phẩm có giá trị thẩm mỹ cao và độ bền vượt trội. Sản phẩm thích hợp làm quà tặng người yêu, bạn bè vào các dịp lễ hoặc sinh nhật.	5ca01ef3-1557-44b2-96b7-e99fc6a489ea	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:15:22.368199	2025-11-22 01:15:22.368199	205000.00	0.00	f	31
4e6e2cae-5c0b-45a0-9ffa-b522ea3539a7	Gọng kính đa giác nữ	* Bộ sản phẩm Kính Cận Lily Eyewear gồm:\n+ Hộp đựng kính mắt Lily.\n+ Khăn lau kính mắt.\n* Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:15:39.968584	2025-11-22 01:15:39.968584	259.00	0.00	f	32
7421a801-320d-45d0-a565-20acf7f84c74	Gọng kính mắt tròn nam nữ	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:18:14.604839	2025-11-22 01:18:14.604839	118999.00	0.00	f	33
faebc957-3d05-4c7c-abaf-278a5aa6aee5	Ví Da Gập Ba Nam Nữ LOGAN	- Chất liệu: Da PU cao cấp\n- Màu sắc: Đen, Đen phối nâu \nSản phẩm được thiết kế với các ngăn đựng được tối ưu nhất so với các sản phẩm ví trước đây, để đáp ứng nhu cầu lưu trữ của khách hàng. Bên trong ví sở hữu 1 ngăn chính lớn, 1 ngăn gấp, 1 ngăn khóa kéo để đựng tiền hay vật nhỏ quan trọng, 6 ngăn phụ đựng thẻ, giấy tờ và 1 ngăn thẻ phụ ở ngoài dùng để đựng thẻ xe,...	5ca01ef3-1557-44b2-96b7-e99fc6a489ea	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:18:24.015192	2025-11-22 01:18:24.015192	249000.00	0.00	f	34
159b0c07-b24e-4fa0-b85c-9e4f3bfe244e	Gọng kính nữ mắt oval kim loại	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:20:10.085176	2025-11-22 01:20:10.085176	158999.00	0.00	f	35
5dc9f680-cdda-44a9-9bf8-51688a32f426	Túi Da Nam Nữ Monogram DANTE	- Chất liệu: Da PU cao cấp\n- Màu sắc: Đen, Đen nâu\nLớp lót bằng vải dệt\nKhóa kéo\nNgăn chính có kích thước lớn\nThẻ tên bằng da PU có thể tháo rời\nDây đeo: điều chỉnh độ dài	d9d08d20-b12f-4abe-8147-5810e758e7ac	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:21:55.782503	2025-11-22 01:21:55.782503	275000.00	0.00	f	36
c6967f8e-0e52-4327-a7ef-dc238d043224	Túi Da Nam Nữ Monogram SLOCK	- Chất liệu: Da PU cao cấp.\n- Màu sắc: Đen·\n- Kích thước: 14 x 17 x 5 cm (Chiều dài x Chiều cao x Chiều rộng)\nDây đeo: Có thể tháo rời và điều chỉnh độ dài\nChiều dài dây đeo: 45.5 cm\nChiều dài dây đeo tối đa: 54.0 cm	5ca01ef3-1557-44b2-96b7-e99fc6a489ea	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:27:33.125941	2025-11-22 01:27:33.125941	275000.00	0.00	f	37
aa1181c1-13af-4d18-b081-d606013573ce	Gọng kính chất liệu Titan	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:28:38.880719	2025-11-22 01:28:38.880719	199000.00	0.00	f	38
f30d900c-fceb-4e89-961c-ac81e02530a1	Ví Da REX	- Thiết kế đặc biệt: 1 ngăn hộp có khóa bật phù hợp thẻ hoặc giấy tờ sử dụng thường xuyên thiết kế riêng để lấy thẻ nhanh, không cần mở ví.\n- Chất liệu: Da PU trượt nước nhẹ, giúp ví không bị ẩm khi gặp nước .Ít bị gãy da sau thời gian dài sử dụng, phù hợp dùng lâu dài.\n- Màu sắc: Đen\n- Kích thước: 7 x 10 x 2.5 cm, chiều dài ví khi mở 20.5cm - nhỏ gọn khi di chuyển	5ca01ef3-1557-44b2-96b7-e99fc6a489ea	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:30:26.989601	2025-11-22 01:30:26.989601	249000.00	0.00	f	39
4b02b03d-87c1-471d-a139-24fdc45541c9	Kính giả cận nam nhựa cứng cáp	* Bộ sản phẩm Kính Cận Lily Eyewear gồm:\n+ Hộp đựng kính mắt Lily.\n+ Khăn lau kính mắt.\n- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.	a89d3fa5-bd35-44e8-aec0-ac7a119d171d	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:33:49.836729	2025-11-22 01:33:49.836729	159000.00	0.00	f	40
76bb9b2a-7805-4461-b924-e3d0c06a77b5	Ví Đứng Da Đựng Thẻ	- Chất liệu: Da PU cao cấp. Logo in dập chìm sang trọng và chất liệu da nhân tạo cao cấp được chọn lựa kỹ lưỡng, thân thiện với động vật, giúp tạo nên sản phẩm có giá trị thẩm mỹ cao và độ bền vượt trội.\nSản phẩm ví da PU cao cấp của thương hiệu được thiết kế với các ngăn đựng được tối ưu hóa để đáp ứng nhu cầu lưu trữ của khách hàng. \nBên trong gồm 4 ngăn đựng thẻ.\nSản phẩm thích hợp làm quà tặng người yêu, bạn bè vào các dịp lễ hoặc sinh nhật.	5ca01ef3-1557-44b2-96b7-e99fc6a489ea	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:34:45.427627	2025-11-22 01:34:45.427627	149000.00	0.00	f	41
65595694-dc73-40b5-b1e9-b7663e86b027	Kính mắt nam nữ tròn to	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	a89d3fa5-bd35-44e8-aec0-ac7a119d171d	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:36:43.903285	2025-11-22 01:36:43.903285	439000.00	0.00	f	42
f413b48a-852b-40be-8b84-d52b589dc8fb	Túi Hộp Da Đeo Chéo PERRY	- Chất liệu: Da PU\n- Màu sắc: Đen\n- Kích thước: 22,5 x 17 x 5 cm ( dài-cao-rộng). Túi hộp mặt trước: 20 x 11 x 3 cm\n- Tính năng\nNgăn chứa:\n- 1 ngăn chính lớn: sổ tay, tập vở A5,...\n+ 1 ngăn phụ nhỏ: thẻ xe, ví, chìa khóa, điện thoại (ip thường)\n+ 1 ngăn phụ lớn có zip: ví, thẻ xe, sổ tay nhỏ, điện thoại (ip pro max)\n- 1 ngăn hộp phụ mặt trước: điện thoại, ví, tai nghe,...\nDây đeo: có thể tháo rời dễ dàng và điều chỉnh độ dài dây	d9d08d20-b12f-4abe-8147-5810e758e7ac	b97497a9-fdce-486e-bbac-7b83f681a12f	active	2025-11-22 01:37:59.294365	2025-11-22 01:37:59.294365	295000.00	0.00	f	43
552d1685-d268-43c6-96a3-152faf60cb19	Kính gọng tròn màu sắc thời trang	+ Hộp đựng kính mắt Lily.\n+ Khăn lau kính mắt.\n- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 01:40:25.749006	2025-11-22 01:40:25.749006	379000.00	0.00	f	44
d9a7b733-5b82-42bf-b279-22791f057658	Áo Hoodie Morning Star Bunny	- Chất liệu: Nỉ bông 360gsm\n- Form: Oversize\n- Màu sắc: Kem\n- Thiết kế: In lụa	c53c187a-2559-48aa-96a2-d1430eba1597	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 01:48:38.505082	2025-11-22 01:48:38.505082	290000.00	0.00	f	45
80275163-3c62-48ee-b03e-574eea49687f	Áo Thun Teelab Basketball Jersey	Chất liệu: Vải lưới thể thao\nForm: Oversize\nMàu sắc: Đen/Trắng/Xanh Than\nThiết kế: In lụa	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 01:55:45.629673	2025-11-22 01:55:45.629673	175000.00	0.00	f	46
a6954114-27c7-479c-ab67-5eb106420bcf	Áo Thun Teelab Sporty Side-Line	- Chất liệu: Vải waffle\n- Form: Oversize\n- Màu sắc: Đen/Xám/kem\n- Thiết kế: Thêu\nThích hợp mặt hằng ngày, vải thoáng mát	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 01:58:53.7582	2025-11-22 01:58:53.7582	175000.00	0.00	f	47
8ec6ce6d-2227-4f33-8e83-67b84d9087a8	Áo Thun Wash Rodeos	- Chất liệu: Cotton\n- Form: Oversize\n- Màu sắc: Wash Xám/Wash Nâu\n- Thiết kế: In lụa\nVải thoáng mát mặc mùa hè, đi chơi đi học thỏa mái	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:02:29.492357	2025-11-22 02:02:29.492357	200000.00	0.00	f	48
6e0e4f2a-3c49-4b89-b82f-cc2d1a127690	Áo Khoác Bomber Dù Hai Lớp	- Áo khoác dù nam hàng VNXK\n- Chất liệu vải áo bomber nam dù nhám dày dặn 2 lớp.Trong lớp lót giúp áo thoáng nhiệt.\n- Thiết kế áo bomber dù form cực đẹp, các chi tiết logo sắc nét. \n- Áo gió nam gồm 2 túi ngoài an toàn và 1 túi trong	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:37:08.018804	2025-11-22 23:37:08.018804	139000.00	0.00	f	67
ee61f1a8-b86b-4a3c-8007-a387357958f9	Kính giả cận chống ánh sáng xanh	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	a89d3fa5-bd35-44e8-aec0-ac7a119d171d	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:05:06.244889	2025-11-22 02:05:06.244889	499000.00	0.00	f	49
8d66e327-bce2-451f-822b-9eb027495e6b	Áo Thun Slow Sunday T-Shirt	- Chất liệu: Cotton\n- Form: Oversize\n- Màu sắc: Đen/Kem\n- Thiết kế: In lụa	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:05:19.116977	2025-11-22 02:05:19.116977	175000.00	0.00	f	50
6a88af12-6b0a-47b2-9516-f2cbef7a4081	Kính giả cận nam thời trang	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	a89d3fa5-bd35-44e8-aec0-ac7a119d171d	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:06:34.23241	2025-11-22 02:06:34.23241	900000.00	0.00	f	51
f5b43ac7-eec0-4217-8204-e38ceca74632	Áo Thun Keyboard Form Rộng	- Chất liệu: Cotton\n- Form: Oversize\n- Màu sắc: Trắng Xám Tiêu\n- Thiết kế: In lụa	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:08:05.119082	2025-11-22 02:08:05.119082	230000.00	0.00	f	52
ede10d4a-99f5-4a5c-85b7-fa4fac464fa5	Gọng kính mắt Oval màu sắc thời trang	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:09:06.273248	2025-11-22 02:09:06.273248	299000.00	0.00	f	53
54f193bc-c235-43e6-8736-54f5e0844064	Áo Thun Mini Icons Tshirt	- Chất liệu: Cotton\n- Form: Oversize\n- Thiết kế: Thêu	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:11:27.083353	2025-11-22 02:11:27.083353	175000.00	0.00	f	54
72a09739-6b1a-49a5-9837-a7d782b71b13	Áo Polo Sweater Nỉ Chân Cua Basic	- Chất liệu: Nỉ\n- Form: Oversize\n- Màu sắc: Xám Tiêu/Đen/Xám Đậm/Xanh Navy\n- Thiết kế: In cao thành	c53c187a-2559-48aa-96a2-d1430eba1597	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:15:45.163057	2025-11-22 02:15:45.163057	225000.00	0.00	f	55
44df2435-da86-44aa-ab4d-2901eb203d4e	Gọng kính cổ điển thời trang	- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.\nChất liệu gọng kính : Kim loại + Nhựa	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:18:50.129207	2025-11-22 02:18:50.129207	399000.00	0.00	f	56
dadfbde5-a74d-48d9-9f03-1af9943a92ed	Áo Sơ Mi Tay Dài Kẻ Sọc	- Chất liệu: Vải Oxford\n- Form: Oversize\n- Màu sắc: Xanh/Hồng/Xám	61fd3769-9276-4155-a6e7-3af4343ba5e0	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:18:54.232664	2025-11-22 02:18:54.232664	220000.00	0.00	f	57
b346f32d-4f9b-4343-99f3-044ef538547c	Gọng kính mắt mèo thời trang	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	2254c194-747e-4639-adcd-698b5005a0ff	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:21:15.151022	2025-11-22 02:21:15.151022	499000.00	0.00	f	58
c2647feb-38af-4b08-ba71-8ae485eee874	Áo Khoác Gió Nam Nữ 2 lớp Windbreaker	- Chất liệu: Gió dù 2 lớp\n- Form: Oversize\n- Màu sắc: Đen\n- Thiết kế: Khoá kéo, có mũ, in lụa cao cấp	c53c187a-2559-48aa-96a2-d1430eba1597	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:21:16.343086	2025-11-22 02:21:16.343086	275000.00	0.00	f	59
8688f9ce-06bd-4ec4-acbd-15d32fd161b8	Kính giả cận gọng đa giác kim loại	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	a89d3fa5-bd35-44e8-aec0-ac7a119d171d	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:23:29.959772	2025-11-22 02:23:29.959772	449000.00	0.00	f	60
40877b39-0034-46ec-877d-bdc02bfcbffd	Quần Kaki Xếp Ly Form Rộng Ống Suông	- Chất liệu: Vải Kaki\n- Form: Oversize\n- Màu sắc: Đen/Be\n- Thiết kế: Thêu	153ed4d5-a042-4f74-81c9-1cb17aa76861	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:24:43.621138	2025-11-22 02:24:43.621138	260000.00	0.00	f	61
3cb525c1-f752-4313-a92b-84c4d206928d	Kính 0 độ nhẹ nhàng thời trang	- Chân gọng kính làm từ nhựa dẻo, giúp mang gọng kính trong thời gian dài cũng không gây khó chịu hay đau ở vành tai.\n- Mắt kính theo gọng là mắt kính 0 độ các bạn có thể mang giả cận, chống bụi và lắp mắt kính cận.\n- Giá sản phẩm chưa bao gồm dịch vụ cắt mắt kính cận.\n- Chốt gọng chắc chắn giúp giữ form kính mắt tốt.\n- Gọng kính được thiết kế thời trang phù hợp cho cả nam và nữ.\n- Các gọng KÍNH MÁT được phủ lớp chống UV400.	a89d3fa5-bd35-44e8-aec0-ac7a119d171d	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-22 02:27:26.849119	2025-11-22 02:27:26.849119	249000.00	0.00	f	62
36e08bfd-a6e4-4051-8b92-5d369fcc4a71	Áo Sơ Mi Eco Oxford Signature	- Chất liệu: Vải Oxford \n- Form: Oversize, tay ngắn\n- Màu sắc: Đen/Hồng/Xanh Than/Xanh Dương/Trắng\n- Thiết kế: In lụa	61fd3769-9276-4155-a6e7-3af4343ba5e0	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:28:21.247795	2025-11-22 02:28:21.247795	210000.00	0.00	f	63
1b85f0ab-968d-426e-8f30-cd790618b67f	Áo Sơ Mi Cộc Tay Striped Boxy	- Chất liệu: Vải Oxford\n- Form: Boxy\n- Màu sắc: Đen\n- Thiết kế: Kẻ sọc	61fd3769-9276-4155-a6e7-3af4343ba5e0	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:30:11.966408	2025-11-22 02:30:11.966408	230000.00	0.00	f	64
7d0663ca-e5c5-458d-b753-b6f4a3f9176c	Áo Bóng Chày Kẻ Sọc Jersey Striped	- Chất liệu: Vải Teelab\n- Form: Oversize\n- Màu sắc: Đen/đỏ\n- Thiết kế: Kẻ Sọc	61fd3769-9276-4155-a6e7-3af4343ba5e0	ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	active	2025-11-22 02:32:26.023275	2025-11-22 02:32:26.023275	310000.00	0.00	f	65
44ffb6ce-2d0c-43d8-a4f8-344dcc17847a	Áo Khoác Nam VINTINO Thêu Logo	- Chất liệu: Vải nỉ 2Da cao cấp\n- Kiểu dáng: Áo khoác thể thao, dáng suông\n- Thiết kế: Thêu logo VINTINO nổi bật trước ngực\n- Tính năng: Co giãn, thấm hút mồ hôi tốt, giữ ấm\n- Phù hợp: Dạo phố, đi học, đi chơi, vận động nhẹ, thể thao thường ngày	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:33:35.458403	2025-11-22 23:33:35.458403	149000.00	0.00	f	66
5948ad05-3969-43c8-bc89-be43117c2282	Áo Hoodie Zip Form Rộng	- Chất liệu: Nỉ 2 Da Cotton dày dặn, mềm mại, co dãn\n- Kiểu dáng: khoá zip, áo dài tay, basic, thoải mái \n- Màu sắc: Đen, Ghi, Xám Nhạt, Xám Đậm\n- Đường may được gia công tỉ mỉ, chắc chắn\n- Thiết kế hiện đại, trẻ trung, năng động, dễ phối đồ\n- Xuất sứ VIỆT NAM	c53c187a-2559-48aa-96a2-d1430eba1597	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:43:43.097149	2025-11-22 23:43:43.097149	198999.00	0.00	f	68
d3e20b93-a1e4-463d-8935-e2afdfa1c369	Áo Khoác Gió 2 Mặt	- Chất liệu áo gió nam: Gió tráng\n- Form dáng áo khoác nam: Suông, mặc được cả nam và nữ\n- Thiết kế: 2 lớp , phối line dọc tay áo. In logo trẻ trung. Mặc được cả 2 mặt\n- Mặc đi làm, đi chơi, đi phượt, du lịch dã ngoại, đi câu, hay bất kỳ đâu, vô cùng tiện lợi.	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:47:21.607344	2025-11-22 23:47:21.607344	159000.00	0.00	f	69
a14e341c-b408-4d64-89eb-174b6ccc29fd	Quần Shorts thể thao thoáng khí Exdry	Chinh phục mọi trận đấu với Quần Short nam 6inch Pickleball Smash Shot, một thiết kế không thể thiếu trong bộ sưu tập quần thể thao chuyên dụng của bạn. Là một item nổi bật trong dòng sản phẩm quần nam, chiếc quần này được dệt từ sự kết hợp của 90% sợi Nylon siêu nhẹ và 10% Spandex co giãn vượt trội.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-22 23:49:54.029155	2025-11-22 23:49:54.029155	179.00	0.00	f	70
be673b6c-0b78-48df-a2aa-bd9d4b48536c	Quần Short Nam Trơn Vải Kaki	- Quần short kaki nam VINTINO được thiết kế theo đúng form của nam giới Việt Nam\n- Với chất liệu kaki gió đơn giản, sản phẩm này mang lại sự khỏe mạnh và thoải mái cho người mặc\n- Được thiết kế với form đùi cộc và cạp chun, quần short này sẽ vừa vặn trên cơ thể các bạn\n- Màu sắc  4 màu cơ bản: Đen - Trắng - Be - Rêu	bbe41a47-8a08-43e4-9a5d-b599237fcd81	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:51:59.849359	2025-11-22 23:51:59.849359	79000.00	0.00	f	71
261926a1-8d99-40a6-b10c-2089a738e0dd	Quần Short Jean Nam Vintino Form Trẻ Trung	- Chất liệu: Jean Cotton cao cấp – bền màu, co giãn nhẹ, chống nhăn và khó rách trong quá trình sử dụng.\n- Xuất xứ: Hàng Việt Nam xuất khẩu, được may đo tỉ mỉ bởi những thợ lành nghề, đảm bảo độ bền và tính thẩm mỹ cao.\n- Thiết kế tối giản, cá tính nhưng vẫn tiện dụng, tạo cảm giác thoải mái khi mặc.\n- Phù hợp với nhiều hoàn cảnh: đi chơi, cafe, ở nhà, thể thao nhẹ nhàng...\n- Màu sắc: Đen – Xanh Denim dễ phối với áo thun, sơ mi hay áo polo.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:55:05.384308	2025-11-22 23:55:05.384308	139000.00	0.00	f	72
74b7129b-490a-4fa0-baaa-dfbd7d3d2d8a	Quần shorts ECC Ripstop Coolmate	Được thiết kế với triết lý tối giản và năng động, Quần shorts ECC Ripstop là một mảnh ghép không thể thiếu trong tủ đồ hàng ngày của phái mạnh. Đây là một trong những mẫu quần short nam đa dụng nhất, dễ dàng đồng hành cùng bạn từ không gian thoải mái tại nhà đến những buổi dạo phố hay cà phê cuối tuần.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-22 23:56:26.136079	2025-11-22 23:56:26.136079	229000.00	0.00	f	73
7cdbae4c-ed12-481e-96ed-8c395173757e	Quần Short Jean Đùi Cộc Rách Gối	- Thiết kế trẻ trung, cá tính: Quần short jean rách QSJ04 mang phong cách năng động, phù hợp với giới trẻ yêu thích sự mới mẻ và nổi bật.\n- Form dáng thoải mái, linh hoạt: Cạp chun co giãn giúp ôm vừa vặn vòng eo, dễ dàng vận động, phù hợp với nhiều dáng người.\n- Chất liệu jean cao cấp: Vải jean mềm, bền màu, không bai nhão, giữ form tốt sau nhiều lần giặt.\n- Chi tiết rách thời trang: Được xử lý tỉ mỉ, tạo điểm nhấn cá tính nhưng vẫn đảm bảo độ bền của sản phẩm.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:57:08.814932	2025-11-22 23:57:08.814932	99000.00	0.00	f	74
6bed6005-f417-4c9e-ac03-94f8e8928f56	Quần Chino nam 7 inch	Quần Chino nam 7 inch là định nghĩa hoàn hảo cho sự thoải mái và linh hoạt trong trang phục hằng ngày. Với chất liệu là sự pha trộn tinh tế giữa 98% Cotton và 2% Spandex, chiếc quần này không chỉ kế thừa sự mềm mại, thoáng khí và thấm hút mồ hôi vượt trội của Cotton mà còn được tăng cường độ co giãn nhẹ nhàng từ Spandex.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-22 23:58:48.600226	2025-11-22 23:58:48.600226	379000.00	0.00	f	75
e8decc54-4b81-4835-a928-ae70f62d4144	Quần Short Đùi Nam Nữ Túi Hộp Cúc Bấm Vải Kaki	-Chất Liệu: Vải kaki gió\n- Giặt ko đổ lông hay bay màu, thấm hút mồ hôi và thoải mái ko gò bó khi vận động\n- Giặt tay hay giặt máy thoải mái không sợ ra màu, nhăn, mất form \t\n- Đường may chuẩn chỉnh, tỉ mỉ, chắc chắc, đứng form\n- Màu sắc: Đen, Be, Trắng	bbe41a47-8a08-43e4-9a5d-b599237fcd81	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-22 23:59:04.928774	2025-11-22 23:59:04.928774	99000.00	0.00	f	76
2d28ac84-8b33-4ba8-998f-6fc19b52f88c	Quần Âu Nam Hàn Quốc Ống Côn Công Sở	- Quần âu nam Hàn Quốc hàng tiêu chuẩn VNXK chính hãng VINTINO do Xưởng Sản Xuất Trực Tiếp.\n- Quần âu vải tuyết hàn thiết kế trẻ trung. thoải mái\n- Quần baggy nam có cạp quần phối viền đẹp mắt, bo viền túi, đường may không chỉ thừa, tinh tế từng mm\n- Chất liệu quần âu baggy nam: Vải tuyết hàn dày dặn, co giãn nhẹ\n- Màu sắc quần vải nam hàn quốc: 4 màu cơ bản:  Đen, Be, Xanh Than, Ghi	153ed4d5-a042-4f74-81c9-1cb17aa76861	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:03:04.983684	2025-11-23 00:03:04.983684	145000.00	0.00	f	77
b32f0184-66b2-4da1-ae07-a53d522a8991	Quần Short Nam Thể Thao Promax-S1	Quần Short Nam Thể Thao Promax-S1 là lựa chọn lý tưởng cho những chàng trai yêu thích vận động, giúp bạn chinh phục mọi giới hạn trong cảm giác thoải mái tuyệt đối. Sản phẩm được dệt từ 100% vải Polyester chuyên dụng cho thể thao, nổi bật với trọng lượng siêu nhẹ và độ bền vượt trội.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:03:52.418356	2025-11-23 00:03:52.418356	378000.00	0.00	f	78
17129133-69e0-4be2-9b2f-2b32a406474e	Quần Thể Thao Nam 7" Ultra Shorts	Được thiết kế để phá vỡ mọi giới hạn, Quần Thể Thao Nam 7" Ultra Shorts là người bạn đồng hành lý tưởng cho mọi buổi tập. Sản phẩm được dệt từ chất liệu vải Polyester theo kiểu Woven Plain, tạo nên bề mặt mềm mịn, nhẹ và cực kỳ bền bỉ, hạn chế tối đa việc sờn xước do ma sát khi vận động cường độ cao.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:06:28.49407	2025-11-23 00:06:28.49407	189000.00	0.00	f	79
fd104ffe-9365-4607-ac3c-984671638ba0	Quần short thể thao nam Promax-S1	Quần Short Nam Thể Thao Promax-S1 là lựa chọn lý tưởng cho những chàng trai yêu thích vận động, giúp bạn chinh phục mọi giới hạn trong cảm giác thoải mái tuyệt đối. Sản phẩm được dệt từ 100% vải Polyester chuyên dụng cho thể thao, nổi bật với trọng lượng siêu nhẹ và độ bền vượt trội.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:08:34.729574	2025-11-23 00:08:34.729574	179000.00	0.00	f	80
155f54ef-0bfd-497b-9227-cbbb490fe679	Quần Âu Nam Hàn Quốc Dáng Baggy	Quần tây nam là trang phục không thể thiếu của cánh mày râu. Những chiếc quan tay nam cao cấp thường có thiết kế đơn giản, kiểu dáng thanh lịch, dễ dàng kết hợp với những kiểu trang phục khác nhau.\nĐặc biệt, chất liệu để làm nên quần tây nam Hàn Quốc có độ co giãn tốt, mềm mại, tạo sự thoải mái cho các quý ông. Dù là đi dự sự kiện, đám cưới,... Hay đi chơi, dạo phố hàng ngày thì chiếc quần âu nam vẫn là lựa chọn tiện lợi, phù hợp nhất.	153ed4d5-a042-4f74-81c9-1cb17aa76861	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:08:58.962744	2025-11-23 00:08:58.962744	175000.00	0.00	f	81
c9fa5e7f-0a47-4bb5-8b0d-e2119803a990	Quần Thể Thao Nam 7" Ultra Shorts	Được thiết kế để phá vỡ mọi giới hạn, Quần Thể Thao Nam 7" Ultra Shorts là người bạn đồng hành lý tưởng cho mọi buổi tập. Sản phẩm được dệt từ chất liệu vải Polyester theo kiểu Woven Plain, tạo nên bề mặt mềm mịn, nhẹ và cực kỳ bền bỉ, hạn chế tối đa việc sờn xước do ma sát khi vận động cường độ cao.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:11:08.337589	2025-11-23 00:11:08.337589	199000.00	0.00	f	82
ecb37d0b-6f27-4ee9-9209-5fbb6f19c900	Quần tây nam Hàn Quốc dáng baggy suông	Quần baggy nam ống rộng vải hàn, quần tây âu nam co giãn thời trang VINTINO chính là gợi ý tuyệt vời cho nam giới mỗi khi lựa chọn trang phục mỗi ngày. \nMẫu Quần baggy nam ống rộng vải hàn, quần tây âu nam co giãn thời trang VINTINO thiết kế dáng trơn đơn giản và toát lên vẻ lịch lãm tinh tế, mang đến phong cách thời trang trẻ trung, năng động\nKiểu dáng: Thiết kế form Hàn Quốc, dễ mặc, dễ phối đồ. mang lại phong cách trẻ trung, lịch lãm	153ed4d5-a042-4f74-81c9-1cb17aa76861	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:11:41.787414	2025-11-23 00:11:41.787414	149000.00	0.00	f	83
25b54462-1033-4b54-9b0b-01584883b4c4	Quần nam Travel Shorts 7inch	Gói gọn sự tự do và năng động vào trong một thiết kế, Quần nam Travel Shorts 7inch chính là người bạn đồng hành lý tưởng cho mọi hoạt động của phái mạnh. Được tạo nên từ sự kết hợp của 92% sợi Polyester và 8% Spandex, chiếc quần mang đến trải nghiệm vượt trội. Chất liệu vải không chỉ siêu nhẹ, mềm mại trên da mà còn có độ co giãn tuyệt vời.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:12:49.937148	2025-11-23 00:12:49.937148	249000.00	0.00	f	84
0185afdd-daf1-4976-ab63-cf18e8a89e41	Quần âu nam sidetab ống suông	- Chất liệu quần âu nam: Cotton hàn co giãn\n- Bảng màu quần cạp cao nam: Đen, Ghi Đậm, Be\n- Form dáng quần tây nam: Baggy ống suông\n- Thiết kế quần âu sidetab: 1 cúc cài, kèm đai khuy xương cá 2 bên sườn, chiết ly tinh tế tạo cảm giác thoải mái cho người mặc	153ed4d5-a042-4f74-81c9-1cb17aa76861	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:15:47.686064	2025-11-23 00:15:47.686064	169000.00	0.00	f	85
0269d2c8-25d2-4b3a-9e9a-6baed2a5d87f	Quần Shorts Nam New French Terry V2	Là phiên bản "ra đời sau" với công năng vượt trội, Quần Shorts Nam New French Terry V2 là một item không thể thiếu trong tủ đồ quần nam. Điểm đặc biệt của chiếc quần short nam này đến từ kiểu dệt French Terry trên nền vải CVC, tạo nên một bề mặt tiếp xúc mang lại sự mát mẻ ngay từ lần đầu chạm vào da.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:16:06.504491	2025-11-23 00:16:06.504491	259000.00	0.00	f	86
7c4c1ba9-1370-468d-9543-e36d9bb5aeaf	Quần Shorts Thể Thao 5" Moving	Được thiết kế cho những người đàn ông không ngừng chuyển động, Quần Shorts Thể Thao 5" Moving là mảnh ghép hoàn hảo cho tủ đồ tập luyện của bạn. Sản phẩm sử dụng chất liệu vải Polyester dệt theo kiểu Woven Plain, tạo nên bề mặt vải siêu nhẹ, mềm mịn và bền bỉ, giúp bạn tự tin thực hiện những bài tập cường độ cao mà không lo sờn rách.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-23 00:18:08.975174	2025-11-23 00:18:08.975174	139000.00	0.00	f	87
bb03c0a3-8447-4f80-b70f-adf1fceaade6	Quần Tây Nam VINTINO Cạp Cao	- Chất liệu quần âu nam: Tuyết hàn\n- Bảng màu quần cạp cao nam: Đen, Xanh Than, Ghi Đậm, Ghi Nhạt\n- Form dáng quần tây nam: Regular\n- Thiết kế quần âu sidetab: 2 cúc cài, kèm đai khuy xương cá 2 bên sườn, chiết ly tinh tế tạo cảm giác thoải mái cho người mặc	153ed4d5-a042-4f74-81c9-1cb17aa76861	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:22:54.71008	2025-11-23 00:22:54.71008	169000.00	0.00	f	88
9d2820dd-bfb6-4cdb-93ea-0e77a794b993	Áo sơ mi nam form rộng cổ chữ V dài tay	+ Chất lụa thái trơn, mềm mịn không nhăn, không xù, không bai, không phai màu. Mếch cổ và tay làm bằng chất liệu cao cấp, không sợ bong tróc. \n+ Áo sơ mi Form rộng Hàn Quốc ôm trọn bờ vai trẻ trung và phong cách, phù hợp mọi hoàn cảnh kể cả đi chơi và đi làm. \n+ Màu: Trắng, Đen\n+ Các đường may Áo sơ mi nam trắng được gia công kỹ lưỡng, tỉ mỉ đến từng chi tiết.\n+ VINTINO là thương hiệu hàng đầu về Áo sơ mi cổ bẻ trong xu hướng thị trường áo sơ mi tại Việt Nam.	61fd3769-9276-4155-a6e7-3af4343ba5e0	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:25:01.008285	2025-11-23 00:25:01.008285	129000.00	0.00	f	89
2796f05d-c729-48bd-983e-8e3d48923fe2	Áo Sơ Mi Nam Dài Tay Vải Đũi	- Áo sơ mi được thiết kế với form suông thoải mái và cổ bẻ trẻ trung, mang đến vẻ ngoài lịch sự và thời thượng cho người mặc\n- Với chất liệu đũi mềm mát, áo sơ mi VINTINO giúp bạn cảm thấy thoải mái suốt cả ngày dài\n- Thiết kế dài tay phù hợp cho các dịp thông thường hay trong những ngày se lạnh của mùa thu, xuân\n- Bạn có thể giặt áo bằng máy giặt thông thường theo hướng dẫn để bảo quản sản phẩm\n- Đường viền cổ áo được thiết kế theo phong cách tàu truyền thống đơn giản nhưng không kém phần sang trọng	61fd3769-9276-4155-a6e7-3af4343ba5e0	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:28:35.78267	2025-11-23 00:28:35.78267	149000.00	0.00	f	90
90efd963-08cf-411e-a752-a9497f7eaaf1	Quần Jeans Nam siêu nhẹ	Quần Jeans Nam Siêu Nhẹ Coolmate phá vỡ mọi định kiến về sự nặng nề, mang đến trải nghiệm thoải mái và linh hoạt chưa từng có. Sản phẩm sử dụng chất liệu Denim 8.5 Oz, nhẹ hơn đến 30% so với jeans thông thường, kết hợp thành phần 98% Cotton tự nhiên và 2% Spandex.	bbe41a47-8a08-43e4-9a5d-b599237fcd81	95f09dbf-4a08-4da3-91d0-bb59c17d3138	active	2025-11-23 00:29:57.359522	2025-11-23 00:29:57.359522	399000.00	0.00	f	91
ebfd2ebf-e4ae-459b-be4d-c559f275548d	Áo sơ mi nhung tăm form suông	- Áo sơ mi nam được thiết kê cực tinh tế, tay dài, cổ bẻ cùng đường gân giữa thân tạo điểm nhấn\n- Sơ mi unisex chính hãng VINTINO với đường may chỉn chu, khéo léo từng chi tiết\n- Áo sơ mi form rộng được lựa chọn cùng chất vải nhung tăm mềm mịn, không phai màu, bai xù\n- Sơ mi nhung tăm cực hách dáng, tăng độ đẹp trai\n- Áo sơ mi nữ màu sắc đa dạng, trẻ trung phù hợp mọi lứa tuổi	61fd3769-9276-4155-a6e7-3af4343ba5e0	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:31:35.57746	2025-11-23 00:31:35.57746	99000.00	0.00	f	92
004ca463-3862-4b7b-93a6-41e41250ecb7	Quần Jeans Nam Basics dáng Slim fit	Quần Jeans Nam Basics Slim Fit - Nền Tảng Cho Mọi Phong Cách\nQuần Jeans Nam Basics là mảnh ghép không thể thiếu trong tủ đồ của mọi chàng trai hiện đại, một item nền tảng cho sự tự tin và năng động suốt cả ngày. Chiếc quần được chế tác từ chất liệu vải denim cao cấp với thành phần 98% Cotton kết hợp 2% vải Spandex độc đáo.	bfad29e9-032c-4498-b70c-eaac37162870	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:32:23.994276	2025-11-23 00:32:23.994276	419000.00	0.00	f	93
3c323421-accb-4dd9-a288-aad9a577fe1f	Quần Dài Ống Rộng Form Suông	- Chất liệu:  Vải nỉ cotton (nỉ 2da) có độ bền tương cao,dày dặn, mặt trong trơn mặc thoải mái khó bị rách hay hư hỏng khi sử dụng.\n- Form: Dáng suông rộng che khuyết điểm chân to, chân vòng kiềng\n- Thiết kế: \n+ Viền 3 sọc chạy dọc thân quần\n+ Cạp bo chun, có dây rút\n+ Phần gấu có dây kéo, có thể điều chỉnh độ rộng\n+ 2 túi trước sâu rộng	b1017d62-8275-41c0-b79b-3d8659ada027	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:34:52.374476	2025-11-23 00:34:52.374476	155000.00	0.00	f	94
a91d7f6d-2c7a-4195-9a6f-09bf59bfe297	Quần Jeans Nam Copper Denim OG Slim	Quần Jeans Nam Copper Denim OG Slim là sự tôn vinh vẻ đẹp cổ điển, mang đến một lựa chọn thoải mái và chỉnh chu cho phong cách hàng ngày. Đây là chiếc quần jean nam được tạo nên từ chất liệu vải denim dày dặn với định lượng 12 Oz, kết hợp giữa 99% vải cotton mềm mại, đứng phom và 1% vải Spandex để tăng cường độ co giãn.	bfad29e9-032c-4498-b70c-eaac37162870	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:35:15.267421	2025-11-23 00:35:15.267421	519000.00	0.00	f	95
56d7a427-f2f8-41f4-a6b3-b87ed794b8eb	Quẩn Kẻ Caro Ống Rộng	- Quần Caro Ống Rộng Đứng Form Vải Dạ Nhung Kẻ sọc Nam Nữ Unisex\n- Màu Sắc: Kẻ Đen, Kẻ Đỏ, Kẻ Xanh \n- Chất liệu : Dạ Nhung cao cấp, giúp giữ ấm trong thời tiết lạnh, lớp nỉ bên trong tạo cảm giác thoải mái và ấm áp cho người mặc.\n- Quy cách, tiêu chuẩn đường may tinh tế, tỉ mỉ trong từng chi tiết\n- Kiểu dáng: Thiết kế đơn giản, dễ mặc, dễ phối đồ\n- Form Hàn Quốc mang lại phong cách trẻ trung, lịch lãm	b1017d62-8275-41c0-b79b-3d8659ada027	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:36:46.85999	2025-11-23 00:36:46.85999	169000.00	0.00	f	96
b498eac7-3002-41e0-bbe6-f0c7763bee25	Quần Jeans Nam Denim Slim Fit	Quần Jeans Nam Copper Denim Slim Fit Bền Bỉ, Co Giãn Thoải Mái\nNâng tầm phong cách hàng ngày với Quần Jeans Nam Copper Denim, một thiết kế hội tụ đủ các yếu tố từ cổ điển đến hiện đại. Sản phẩm được dệt từ chất liệu vải denim cao cấp với định lượng 12 Oz dày dặn, đứng phom, có thành phần gồm 99% vải cotton và 1% vải Spandex.	bfad29e9-032c-4498-b70c-eaac37162870	ee9a160e-1810-4411-bb4e-ab931cb09079	active	2025-11-23 00:38:56.081344	2025-11-23 00:38:56.081344	499000.00	0.00	f	97
226b4097-287d-4610-897a-3e641f477af5	Quần Dài Baggy Kaki Ống Suông	- Quần ống suông nam dài 4 màu: Đen Trắng Be Rêu\n- Đường kim mũi chỉ cẩn thận, chắc chắn\n- Sản phẩm quần kaki nam ống suông cắt chỉ rất tỉ mỉ, gần như không có chỉ thừa.\n- Chất liệu: Vải quần kaki nam ống suông được làm từ sợi COTTON tự nhiên giúp cho mặt vải lì không bị bóng, giữ được form tốt. Vải quần baggy nam dày dặn, đàn hồi và co dãn nhẹ, mặt vải mềm ướt không xù lông. Vì thành phần cotton nên mặc thoải mái vận động và thoáng mát. Shop chấp nhận giá thành vải cao nhưng đổi lại có vải chất lượng.	b1017d62-8275-41c0-b79b-3d8659ada027	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:41:20.722408	2025-11-23 00:41:20.722408	129000.00	0.00	f	98
ef0c3952-509c-4f61-8bcb-7f7b8d860ca9	Quần Nỉ Nam Ống Suông Rộng Thể Thao	- Quần dài nam nỉ 2 da là sản phẩm được làm từ chất liệu nỉ 2 da, giúp giữ ẩm tốt hơn so với các loại chất liệu khác. \n- Quần cạp chun nam Với độ bên cao, độ co giãn tốt, không bị xù lông, không bị nhắn và dễ dàng giặt giũ, sản phẩm này sẽ là lựa chọn hoàn hảo cho những ngày đông lạnh giá. \n- Quần ống rộng không chỉ có tính năng giữ ấm tốt, quần nỉ 2 da còn có độ bền cao, độ co giãn tốt, không bị xù lông, không bị nhắn và dễ dàng giặt giũ. \n- Với thiết kế đơn giản nhưng không kém phần thời trang, sản phẩm này sẽ giúp bạn tự tin và thoải mái khi diện vào những ngày đồng.	b1017d62-8275-41c0-b79b-3d8659ada027	e1399e40-b775-47ee-977d-9c2b7ec07131	active	2025-11-23 00:43:56.515619	2025-11-23 00:43:56.515619	149000.00	0.00	f	99
3414bfb8-ec3b-46c6-95ea-445567e05e72	Ví đựng tiền mini dáng ngắn	✔️ Ví nữ mini đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 500.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 12.5x9.2x2.1cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện bạc\n✔️ 3 màu sắc tinh tế, dễ sử dụng: Đen, Kem, Jeans	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 00:48:51.617926	2025-11-23 00:48:51.617926	164999.00	0.00	f	100
3bd8a250-7654-4f7b-9a80-6fc050a67a3b	Ví nữ chần gập đôi	✔️ Ví nữ mini đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 500.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 12.5x9.2cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền. cạnh cao cấp, logo và phụ kiện bạc	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 00:51:12.806888	2025-11-23 00:51:12.806888	160000.00	0.00	f	101
47af250b-ee4a-4bb5-800a-b0ff439492ad	Ví đựng tiền mini gập ba	✔️ Ví nữ mini đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 500.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 11x8x2cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện bạc.	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 00:54:13.035076	2025-11-23 00:54:13.035076	13000.00	0.00	f	102
16fac00e-9179-4156-8df3-2524f85512cf	Ví đựng tiền nữ cầm tay hình chữ nhật	✔️ Ví nữ mini đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 500.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 12.5x9.2x2.1cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện bạc\n✔️ 3 màu sắc tinh tế, dễ sử dụng: Đen, Kem, Jeans	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 00:55:49.769315	2025-11-23 00:55:49.769315	16000.00	0.00	f	103
bb585dc8-9dc7-42cc-a532-ac4d1c092a9a	Ví nữ mini đính đá đeo chéo	✔️ Ví nữ mini đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 300.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 11x 8x 3,5cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện bạc\n✔️ 2 màu sắc tinh tế, dễ sử dụng: Đen, Kem	bf82bdf3-6ee2-438f-bd28-469c96dffb8e	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 00:57:48.192003	2025-11-23 00:57:48.192003	210000.00	0.00	f	104
a293c53b-0d41-4fa9-a158-49a13295d5c1	Túi kẹp nách nữ cao cấp phối xích	✔️ Túi xách nữ đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 500.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 20x14x5,5cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện hợp kim không gỉ\n✔️ Màu sắc: Đen, Nâu, Jeans	6c6d9548-4b93-4534-a70b-b28d98f00ce8	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 01:00:35.297237	2025-11-23 01:00:35.297237	440000.00	0.00	f	105
bcfed53f-a779-466d-94e9-b631b4617993	Túi kẹp nách đeo chéo da chần	✔️ Túi xách nữ đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 500.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kịch thước: 21,5x23x4,5cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện hợp kim không gỉ	6c6d9548-4b93-4534-a70b-b28d98f00ce8	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 01:02:46.833306	2025-11-23 01:02:46.833306	440000.00	0.00	f	106
bcc9da9b-b798-4636-b48f-5af85cb8381e	Túi kẹp nách đeo chéo nữ cao cấp	✔️ Túi xách nữ đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 100.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kích thước: 25x16x7cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện hợp kim không gỉ\n✔️ Màu sắc tinh tế, dễ sử dụng: Jeans, Trắng	6c6d9548-4b93-4534-a70b-b28d98f00ce8	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 01:04:28.525169	2025-11-23 01:04:28.525169	440000.00	0.00	f	107
06e25602-2755-4509-a9ad-bd5d50417304	Túi xách nữ đeo chéo dây xích da sần	✔️ Túi xách nữ đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 100.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU sần cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Màu sắc: Đen\n✔️ Kích Thước: 17x12x6cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, dây xích bạc dày dặn	6c6d9548-4b93-4534-a70b-b28d98f00ce8	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 01:05:36.061373	2025-11-23 01:05:36.061373	440000.00	0.00	f	108
242937f2-bccf-4371-a328-529b29be7fa9	Túi đeo chéo phong cách Hàn Quốc phối khoá vàng	✔️ Túi xách nữ đến từ SEEME, thương hiệu Việt Nam Local Brand từ 2020 với hơn 300.000 khách hàng đã ủng hộ.\n✔️ Chất liệu: Da PU cao cấp siêu bền, có tính năng chống bẩn chống thấm nước tốt\n✔️ Kịch thước: 22,3x11x4cm\n✔️ Chất lượng gia công tỉ mỉ và kĩ càng, sơn viền cạnh cao cấp, logo và phụ kiện hợp kim không gỉ	6c6d9548-4b93-4534-a70b-b28d98f00ce8	845a0b36-8552-4a05-af91-bae94ef9c37b	active	2025-11-23 01:06:51.794979	2025-11-23 01:06:51.794979	350000.00	0.00	f	109
\.


--
-- TOC entry 5355 (class 0 OID 17368)
-- Dependencies: 292
-- Data for Name: promotion_products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.promotion_products (promotion_id, product_id) FROM stdin;
\.


--
-- TOC entry 5356 (class 0 OID 17371)
-- Dependencies: 293
-- Data for Name: promotions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.promotions (id, name, type, value, start_date, end_date, status, code, description, min_order_value, usage_limit, used_count, max_discount_value, created_at, updated_at) FROM stdin;
5e1b0e25-f789-4a31-9ec9-f1706ec49848	BLACKFRIDAY	percentage	50.00	2025-11-25 00:00:00	2025-12-31 00:00:00	active	BLACKFRIDAY	Ngày thứ 6 đen tối, giảm vô đối, giảm hẳn 50% giảm tối đa 300.000k cho khách luôn nè.	500000.00	100	1	299999.00	2025-11-25 10:35:33.423916	2025-11-25 10:35:33.423916
\.


--
-- TOC entry 5357 (class 0 OID 17384)
-- Dependencies: 294
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (id, user_id, token, expires_at, created_at, revoked) FROM stdin;
bda76d17-1cf3-4d1b-abb4-e767b1280842	f849cc09-e4e9-4bd2-a931-0cbc2a3e0b8d	8ba3b05d5ac425562dfe1dc4fa4143685683b30fc77abf6d3ce314f576ebac07e389a5a6ab8d017c	2025-11-27 20:17:04.155	2025-11-20 20:17:04.155624	f
2011262f-326b-4a29-a18c-05124ca38303	21dae0c0-22e1-4401-a6bc-63fa8aaf5415	801006cc42566c5d76f15e0a02d913482a70816d94c73e5643a9b3a97cf6858be8e6a03563bbb053	2025-11-27 20:16:22.145	2025-11-20 20:16:22.14655	t
89eb8b2b-4c9f-47dc-9cdc-30013990f164	21dae0c0-22e1-4401-a6bc-63fa8aaf5415	70570f70cc5013843809caed28ea7fa22fa7c47a1638a22bc989a6b5725a04da3e13d2c5e1f3f799	2025-11-27 20:17:38.169	2025-11-20 20:17:38.169241	f
1b91d592-8ffe-4a5b-97bf-eee5fd7819b0	94bc8dc2-224c-4b3f-ae8f-48ac5b4246c5	8ff36731d22811c684040244833a53322d03bf495b3cedff200e49eb408a44a1c4ac5744fa3f8ad1	2025-11-28 14:23:18.926	2025-11-21 14:23:18.925676	t
1a3a2d6a-a4de-4e85-8eca-93054570f512	40685da8-f6f5-48e9-82d5-ef79ab165c6d	a95425c9a44d18d7c5a3cf584a713abaf2075caf3e9b451d0cda5045334f366a7764b3611011a0ab	2025-11-28 14:30:20.059	2025-11-21 14:30:20.059687	f
01a5b49b-ce9c-46c1-a9d0-f64df04b8c4e	21dae0c0-22e1-4401-a6bc-63fa8aaf5415	a0f4c8f88877da0f9489ea8fab51cab79f0c1e00a5f0ea2eb2d84285be5524ce25c54a12e842381a	2025-11-29 00:23:52.871	2025-11-22 00:23:48.362075	f
bfc3bda2-4b0b-4c9d-8cdb-6a4be6560bdc	eba218de-6fdf-44bb-b443-8d8e7e707afc	5c489e76813c6ce770bbee23bcb94f656c45f869dffd57040f2b314e4449f1b3dc51c703b9268dfb	2025-11-29 17:04:08.777	2025-11-22 17:04:08.778094	f
a71a6e6a-2d5e-4169-b777-a15df3ebd1bb	eba218de-6fdf-44bb-b443-8d8e7e707afc	d0e387d94f42531294c6e1cb249975f0f989064d9569c43012d7df6accc30b93f926301624e363fb	2025-11-29 17:19:14.327	2025-11-22 17:19:14.328414	f
16e48525-88d0-4a27-9a84-e9e17ca25c70	eba218de-6fdf-44bb-b443-8d8e7e707afc	d6a7757ddb2bfbaf9c310170046bb8e692b6328433b5406c9fec8428cf16bfc3c6b0f468f9159b03	2025-11-29 18:29:44.369	2025-11-22 18:29:44.370484	f
873e2cb3-ab04-44fe-ad44-bdfdf0dcecb6	eba218de-6fdf-44bb-b443-8d8e7e707afc	20d6ed663af4ff1e44f1ed5150c796c3f7557052e4cde359a1c188c6d68545dcf2a0f0c9eba191d0	2025-11-29 20:21:48.89	2025-11-22 20:21:48.891738	f
a604d2b1-4347-431c-8b28-644cecd0925f	eba218de-6fdf-44bb-b443-8d8e7e707afc	72c72d3a022ca11ef1bafa0a3ccb08cdd73557b2c5ef5775b62df76b7e2dd58ec090eb4e6fbdbeac	2025-11-29 17:03:21.686	2025-11-22 17:03:21.687124	t
fd9f0637-18e4-4fb6-963d-c9c32ced3a87	21dae0c0-22e1-4401-a6bc-63fa8aaf5415	4c0f9b336dc8499f803ad1a58af02872b8c4940f917f6233dc4f360002461db974f2a5ff16f8e3a2	2025-11-29 23:23:32.696	2025-11-22 23:23:25.151674	f
3969c893-5731-4db5-b950-d2c00c8b8b95	eba218de-6fdf-44bb-b443-8d8e7e707afc	166ba589d2ee7dcd061b6a51a253633879db097f1da1ea5e2ec364866006a323a285571bf402f685	2025-11-30 15:34:21.956	2025-11-23 15:34:21.95776	f
f0fea9c9-1de6-4cde-84a7-83921efe398c	eba218de-6fdf-44bb-b443-8d8e7e707afc	ae0f4a65497f45da9f94dd8c03888a80d4a8784963451b356ab49d6d4a559f83fd416b85949786ef	2025-11-30 16:41:15.624	2025-11-23 16:41:15.625877	f
9f3114b4-f5d2-45c1-8ede-89ab782848a6	eba218de-6fdf-44bb-b443-8d8e7e707afc	6d0807e964e0c3430a934723d72a2e62e0833cf14e7b20ef9ca6faaeec96ca377ff58b73dfe6a1a0	2025-11-30 18:00:27.635	2025-11-23 18:00:27.636203	f
dbd26aef-ce13-4f32-8d60-7065d1429b38	eba218de-6fdf-44bb-b443-8d8e7e707afc	3fb7d7c783dbc18b3c8f644f007e6965f5f37f7f823eb60f85d5438b003bead207f8f26d675ea4b6	2025-11-30 19:56:09.526	2025-11-23 19:56:09.527875	f
5a94366f-fe2f-48ca-b20d-64d923814eba	eba218de-6fdf-44bb-b443-8d8e7e707afc	cd10cec7c62f56ce7dae7f877c39cf5b54c610e7c22d3535766e339d26e08de126a695927c474a6a	2025-11-30 22:38:13.028	2025-11-23 22:38:13.029277	f
8def60f4-b1d1-4843-9f9c-d63e17086f2d	eba218de-6fdf-44bb-b443-8d8e7e707afc	8088e92efc5c4d7def2636a76139488b196e8d7a24d547935bfd009167c9224a7e0e1dec2a91ac80	2025-12-01 14:33:38.477	2025-11-24 14:33:38.478176	f
a56d9a54-96aa-4172-8c9a-422fe3c7e111	eba218de-6fdf-44bb-b443-8d8e7e707afc	8fdc540edeb60492957583ebb244bc90285decb256b15ac2abfdd3c5170664e14cc606ee967abf97	2025-12-01 15:34:52.057	2025-11-24 15:34:52.059106	f
1ce1a10a-0b9b-4737-b071-55439e0c0e3b	eba218de-6fdf-44bb-b443-8d8e7e707afc	494159c24e631199fb4bffd84d726a1bf0323084167fdf20ef6b0e06be6980c8536fb81051e7601b	2025-12-01 19:32:22.2	2025-11-24 19:32:22.201655	f
ed05c7b8-015b-42bf-9068-f0be17776e2d	eba218de-6fdf-44bb-b443-8d8e7e707afc	c1032e5895914ab510549c5807a2ae786b2d0395e8d966ca1837ca5a0876f9594c2e3fd2fcdf47c9	2025-12-01 21:00:49.444	2025-11-24 21:00:49.444703	f
874b67a3-6a1c-4bc9-b6e2-9b40f645cd84	eba218de-6fdf-44bb-b443-8d8e7e707afc	7c8610a09190c276d8ac943bea95046e06d40e287723cae9125693ff984d607f0f2226e499321cf0	2025-12-01 22:31:37.326	2025-11-24 22:31:37.327491	f
1bb5f303-07c6-47ff-a13e-baec2a011ede	eba218de-6fdf-44bb-b443-8d8e7e707afc	160b55967d77e301188b54e016bee7f910c2650ec923f325fa66e20a57f9c374d3393f074786fadd	2025-12-01 23:39:15.179	2025-11-24 23:39:15.180291	f
b12d1096-4c0b-42df-995c-462e813c5437	40685da8-f6f5-48e9-82d5-ef79ab165c6d	8b8383f8c9164bc8a8028313c220ef0bb8f2080c2d91445c3864dd42bdf4a3d502b3cc62f87207b4	2025-11-29 23:21:16.898	2025-11-22 23:21:16.899705	t
d88bad90-45e3-4783-ac06-11d287ce341e	eba218de-6fdf-44bb-b443-8d8e7e707afc	dbbac67eb97e08763e85438f606b5599e11bac2aad1a62610379601f2a347d43ee581b140a606b03	2025-12-02 10:27:15.696	2025-11-25 10:27:15.698562	t
9dd51f1c-45bd-49d4-9503-cef0d2562f59	40685da8-f6f5-48e9-82d5-ef79ab165c6d	bdc71588f89a8557d6db2a04616dcb295e163f03c061186ac189542bf55f4d0bd6d6ed1a83319e6a	2025-12-02 10:33:39.101	2025-11-25 10:33:39.102295	t
5c23a1f3-457a-4e3d-9d74-b010a97b55f3	eba218de-6fdf-44bb-b443-8d8e7e707afc	bb5b4ce0bfcd1933afeb3bb622188ecaf76480c00711098d924a0b529426e250256b089196448d5e	2025-12-02 10:35:43.193	2025-11-25 10:35:43.193609	f
45811de0-fc29-4f86-a641-9a8fe5633889	eba218de-6fdf-44bb-b443-8d8e7e707afc	3ede8fa3a3d5ddab0311352fe29e934444147842920b1f1551eca7fc3d86743df422ca220913e8cc	2025-12-02 15:43:02.709	2025-11-25 15:43:02.709889	f
\.


--
-- TOC entry 5358 (class 0 OID 17392)
-- Dependencies: 295
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, user_id, product_id, rating, comment, created_at, images, updated_at, is_public) FROM stdin;
\.


--
-- TOC entry 5364 (class 0 OID 17782)
-- Dependencies: 304
-- Data for Name: size_guides; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.size_guides (id, category_id, size_label, min_height, max_height, min_weight, max_weight, bust, waist, hip, foot_length, description, created_at, updated_at) FROM stdin;
e7dcb60c-1234-4205-9d74-ca56de4ce752	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	XS	150	160	40	50	80	60	85	\N	Fitted, hợp thân hình nhỏ nhắn, nữ mảnh mai hoặc nam slim	2025-11-22 12:52:14.978122+07	2025-11-22 12:52:14.978122+07
bd04990d-5e9b-440d-9835-4cba7aefbcb3	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	S	155	165	45	55	85	65	90	\N	Tiêu chuẩn fitted cho nữ Việt Nam hoặc nam trung bình	2025-11-22 12:52:14.978122+07	2025-11-22 12:52:14.978122+07
a8937644-2e29-48de-8108-5f4735c21e67	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	M	160	170	50	65	90	70	95	\N	Fitted cân đối, hợp nam nữ chiều cao trung bình	2025-11-22 12:52:14.978122+07	2025-11-22 12:52:14.978122+07
da2e1186-07d9-4cc1-ad15-d9cc9afc2a8e	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	L	165	175	60	75	95	75	100	\N	Fitted cho người cao, nam nữ thể hình	2025-11-22 12:52:14.978122+07	2025-11-22 12:52:14.978122+07
5de8e6d7-6b91-44c3-bf98-b52540386ed6	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	XL	170	180	70	85	100	80	105	\N	Fitted lớn, hợp nam cao to hoặc nữ plus size	2025-11-22 12:52:14.978122+07	2025-11-22 12:52:14.978122+07
bd12de9d-2924-4c1c-898c-36ab4264517c	f5b5d60a-9f3a-455c-b056-a9fd67546bc4	XXL	175	185	80	95	105	85	110	\N	Fitted extra large, cho người to lớn	2025-11-22 12:52:14.978122+07	2025-11-22 12:52:14.978122+07
44ca070a-8b9d-4cd7-985f-791b255d6d85	61fd3769-9276-4155-a6e7-3af4343ba5e0	XS	150	160	40	50	80	60	85	\N	Fitted, hợp thân hình nhỏ nhắn, nữ mảnh mai hoặc nam slim	2025-11-22 12:52:57.366945+07	2025-11-22 12:52:57.366945+07
f19b7d16-c51b-492d-b8cc-9ccb85acb01b	61fd3769-9276-4155-a6e7-3af4343ba5e0	S	155	165	45	55	85	65	90	\N	Tiêu chuẩn fitted cho nữ Việt Nam hoặc nam trung bình	2025-11-22 12:52:57.366945+07	2025-11-22 12:52:57.366945+07
f0e92258-0959-4801-8031-d3bf4f212430	61fd3769-9276-4155-a6e7-3af4343ba5e0	M	160	170	50	65	90	70	95	\N	Fitted cân đối, hợp nam nữ chiều cao trung bình	2025-11-22 12:52:57.366945+07	2025-11-22 12:52:57.366945+07
29c76a6b-8149-4c76-ac9d-26d05f66090e	61fd3769-9276-4155-a6e7-3af4343ba5e0	L	165	175	60	75	95	75	100	\N	Fitted cho người cao, nam nữ thể hình	2025-11-22 12:52:57.366945+07	2025-11-22 12:52:57.366945+07
e466c5c4-f44a-4d55-993b-5e5af28c0bb1	61fd3769-9276-4155-a6e7-3af4343ba5e0	XL	170	180	70	85	100	80	105	\N	Fitted lớn, hợp nam cao to hoặc nữ plus size	2025-11-22 12:52:57.366945+07	2025-11-22 12:52:57.366945+07
af6cb31e-621b-41cd-a2d5-1ba8f73b5565	61fd3769-9276-4155-a6e7-3af4343ba5e0	XXL	175	185	80	95	105	85	110	\N	Fitted extra large, cho người to lớn	2025-11-22 12:52:57.366945+07	2025-11-22 12:52:57.366945+07
c0e9ff1a-189d-44ad-bfcd-3fc0596ac56a	c53c187a-2559-48aa-96a2-d1430eba1597	XS	145	155	35	45	85	65	90	\N	Oversize nhẹ, hợp nhỏ nhắn nhưng vẫn rộng rãi	2025-11-22 12:54:30.715498+07	2025-11-22 12:54:30.715498+07
c7a43baa-2071-4d80-8355-18a259108edc	c53c187a-2559-48aa-96a2-d1430eba1597	S	150	160	40	50	90	70	95	\N	Oversize tiêu chuẩn, rộng hơn áo thun 5-10cm	2025-11-22 12:54:30.715498+07	2025-11-22 12:54:30.715498+07
8cc4311a-1ea1-4d25-a5f0-26bf70fe37a1	c53c187a-2559-48aa-96a2-d1430eba1597	M	155	165	45	60	95	75	100	\N	Oversize thoải mái, phù hợp layer bên trong	2025-11-22 12:54:30.715498+07	2025-11-22 12:54:30.715498+07
41d54c98-fc2e-479f-967e-d4380b5c3133	c53c187a-2559-48aa-96a2-d1430eba1597	L	160	170	55	70	100	80	105	\N	Oversize lớn, hợp streetwear	2025-11-22 12:54:30.715498+07	2025-11-22 12:54:30.715498+07
9ed794f2-2219-4ca1-a00f-21bd23198cec	c53c187a-2559-48aa-96a2-d1430eba1597	XL	165	175	65	80	105	85	110	\N	Oversize extra, rộng rãi cho nam to	2025-11-22 12:54:30.715498+07	2025-11-22 12:54:30.715498+07
22d2d2f4-25a2-4fe9-868e-1e766a5bb0cc	c53c187a-2559-48aa-96a2-d1430eba1597	XXL	170	180	75	90	110	90	115	\N	Oversize max, cho người cao lớn	2025-11-22 12:54:30.715498+07	2025-11-22 12:54:30.715498+07
03ce9c14-a6cb-4a04-bb67-99705833b779	153ed4d5-a042-4f74-81c9-1cb17aa76861	XS	150	160	40	50	\N	60	85	\N	Fitted lịch sự, eo nhỏ, hợp nữ mảnh	2025-11-22 12:55:33.747186+07	2025-11-22 12:55:33.747186+07
9d1fa172-e6af-4428-abd4-ea8f1dfe1c00	153ed4d5-a042-4f74-81c9-1cb17aa76861	S	155	165	45	55	\N	65	90	\N	Fitted tiêu chuẩn, eo trung bình	2025-11-22 12:55:33.747186+07	2025-11-22 12:55:33.747186+07
edb4d1c3-e9ed-4734-9b19-7789d8c82a92	153ed4d5-a042-4f74-81c9-1cb17aa76861	M	160	170	50	65	\N	70	95	\N	Fitted cân đối, hợp văn phòng	2025-11-22 12:55:33.747186+07	2025-11-22 12:55:33.747186+07
84e9a50b-13af-49f7-9345-6442facd9746	153ed4d5-a042-4f74-81c9-1cb17aa76861	L	165	175	60	75	\N	75	100	\N	Fitted lớn, cho nam/nữ cao	2025-11-22 12:55:33.747186+07	2025-11-22 12:55:33.747186+07
75f8bcbf-f666-467a-a6b7-90882a9d6554	153ed4d5-a042-4f74-81c9-1cb17aa76861	XL	170	180	70	85	\N	80	105	\N	Fitted extra, eo to	2025-11-22 12:55:33.747186+07	2025-11-22 12:55:33.747186+07
f2c7ed6f-3f4b-493c-b594-692eaca04a76	153ed4d5-a042-4f74-81c9-1cb17aa76861	XXL	175	185	80	95	\N	85	110	\N	Fitted max, cho người lớn	2025-11-22 12:55:33.747186+07	2025-11-22 12:55:33.747186+07
734b6e3f-bc23-4d8c-a4fe-7af6b6853583	b1017d62-8275-41c0-b79b-3d8659ada027	XS	150	160	40	50	\N	60	85	\N	Thoải mái, ống rộng/jeans casual, hợp nhỏ nhắn	2025-11-22 12:56:11.753859+07	2025-11-22 12:56:11.753859+07
c40f6186-ab60-4ca1-8999-1ef6f2735311	b1017d62-8275-41c0-b79b-3d8659ada027	S	155	165	45	55	\N	65	90	\N	Casual tiêu chuẩn, rộng hơn quần âu 5cm	2025-11-22 12:56:11.753859+07	2025-11-22 12:56:11.753859+07
d532bd88-01ae-4441-8ee5-04cf15c6f1d0	b1017d62-8275-41c0-b79b-3d8659ada027	M	160	170	50	65	\N	70	95	\N	Thoải mái cân đối, hợp daily wear	2025-11-22 12:56:11.753859+07	2025-11-22 12:56:11.753859+07
abd44e45-9294-49b2-8a15-a16e6484dd2d	b1017d62-8275-41c0-b79b-3d8659ada027	L	165	175	60	75	\N	75	100	\N	Casual lớn, ống rộng tự do	2025-11-22 12:56:11.753859+07	2025-11-22 12:56:11.753859+07
db0e69eb-731c-41d4-8604-3f89cc99c95f	b1017d62-8275-41c0-b79b-3d8659ada027	XL	170	180	70	85	\N	80	105	\N	Thoải mái extra, cho nam to	2025-11-22 12:56:11.753859+07	2025-11-22 12:56:11.753859+07
0d6ff566-1fcc-4d7d-9801-75e047fd7a05	b1017d62-8275-41c0-b79b-3d8659ada027	XXL	175	185	80	95	\N	85	110	\N	Casual max, rộng rãi	2025-11-22 12:56:11.753859+07	2025-11-22 12:56:11.753859+07
5e0a3315-bba6-4a2b-88fe-90f9bb8d783f	bfad29e9-032c-4498-b70c-eaac37162870	XS	150	160	40	50	\N	60	85	\N	Thoải mái, ống rộng/jeans casual, hợp nhỏ nhắn	2025-11-22 12:56:27.977406+07	2025-11-22 12:56:27.977406+07
8fa95702-e22a-44e8-96e3-e3f2c1f2ae6a	bfad29e9-032c-4498-b70c-eaac37162870	S	155	165	45	55	\N	65	90	\N	Casual tiêu chuẩn, rộng hơn quần âu 5cm	2025-11-22 12:56:27.977406+07	2025-11-22 12:56:27.977406+07
bc0aefc0-3036-4083-9e0b-cbb62562c674	bfad29e9-032c-4498-b70c-eaac37162870	M	160	170	50	65	\N	70	95	\N	Thoải mái cân đối, hợp daily wear	2025-11-22 12:56:27.977406+07	2025-11-22 12:56:27.977406+07
a5af9507-19fd-4550-939e-937e2bc65f0a	bfad29e9-032c-4498-b70c-eaac37162870	L	165	175	60	75	\N	75	100	\N	Casual lớn, ống rộng tự do	2025-11-22 12:56:27.977406+07	2025-11-22 12:56:27.977406+07
318a23ce-8b3b-4ffa-b88a-ae09a466baad	bfad29e9-032c-4498-b70c-eaac37162870	XL	170	180	70	85	\N	80	105	\N	Thoải mái extra, cho nam to	2025-11-22 12:56:27.977406+07	2025-11-22 12:56:27.977406+07
e26dfe09-a23b-499e-a6dc-2bac2667a454	bfad29e9-032c-4498-b70c-eaac37162870	XXL	175	185	80	95	\N	85	110	\N	Casual max, rộng rãi	2025-11-22 12:56:27.977406+07	2025-11-22 12:56:27.977406+07
533033cc-2511-402a-904f-cc6f32057bcb	bbe41a47-8a08-43e4-9a5d-b599237fcd81	S	155	165	45	55	\N	70	92	\N	Quần short ôm vừa, dáng gọn	2025-11-25 21:52:21.874016+07	2025-11-25 21:52:21.874016+07
8cb6aa09-d118-4acd-93cd-a9d27833df4f	bbe41a47-8a08-43e4-9a5d-b599237fcd81	M	165	175	55	65	\N	76	98	\N	Phù hợp đa số dáng người	2025-11-25 21:52:21.874016+07	2025-11-25 21:52:21.874016+07
f706864c-3e34-45a3-aad7-e2bd9b39219b	bbe41a47-8a08-43e4-9a5d-b599237fcd81	L	170	180	65	75	\N	82	104	\N	Thoải mái cho người cao vừa	2025-11-25 21:52:21.874016+07	2025-11-25 21:52:21.874016+07
2dfd9daf-9cc2-4d60-b691-ce7490bb38f7	bbe41a47-8a08-43e4-9a5d-b599237fcd81	XL	175	185	75	85	\N	88	110	\N	Rộng rãi cho người cao to	2025-11-25 21:52:21.874016+07	2025-11-25 21:52:21.874016+07
46c90f23-5bb0-4e2f-a5a3-41fc7e85165c	bbe41a47-8a08-43e4-9a5d-b599237fcd81	XXL	178	190	85	95	\N	94	116	\N	Rất rộng rãi, phù hợp người lớn	2025-11-25 21:52:21.874016+07	2025-11-25 21:52:21.874016+07
27b66b1b-b02a-49e5-bc55-c41f1b541711	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	S	155	165	45	55	88	78	92	\N	Phù hợp người nhỏ nhắn, dáng gọn	2025-11-25 21:53:09.47431+07	2025-11-25 21:53:09.47431+07
5c434c42-58c0-4753-b8ae-22414013f227	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	M	165	175	55	65	94	84	98	\N	Phù hợp dáng người trung bình	2025-11-25 21:53:09.47431+07	2025-11-25 21:53:09.47431+07
c23ceeec-21ca-4340-951c-11465e51a720	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	L	170	180	65	75	100	90	104	\N	Phù hợp dáng cao vừa, vai rộng	2025-11-25 21:53:09.47431+07	2025-11-25 21:53:09.47431+07
9023af67-a507-4ef2-bf2b-1a0d81a72535	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	XL	175	185	75	85	106	96	110	\N	Phù hợp người cao to, vai rộng	2025-11-25 21:53:09.47431+07	2025-11-25 21:53:09.47431+07
a81a2fcc-5927-43e6-9a22-987240b33a64	0cc0c619-e7c3-4968-a64e-0f39c9a2ff92	XXL	178	190	85	95	112	102	116	\N	Phù hợp người rất cao to	2025-11-25 21:53:09.47431+07	2025-11-25 21:53:09.47431+07
\.


--
-- TOC entry 5359 (class 0 OID 17403)
-- Dependencies: 296
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.suppliers (id, name, contact_email, created_at, updated_at, logo_url, phone) FROM stdin;
03f8f07a-58f7-4cfe-9041-60fbc676ed46	Zonef	zonef@gmail.com	2025-11-20 22:05:15.287993	2025-11-20 22:05:15.287993	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763651113/fashion_ecommerce/suppliers/Zonef/logo/Hello.png	0933565258
19b29805-87bf-4b62-94ac-2085e8e9951a	Jean.one	jeanone@gmail.com	2025-11-20 22:08:07.455155	2025-11-20 22:08:07.455155	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763651285/fashion_ecommerce/suppliers/Jean.one/logo/Hello.png	0933565258
ea7ce2e4-6ff5-4e15-a7f3-d4a219ccb506	Teelab	teelab@gmail.com	2025-11-20 22:08:21.892047	2025-11-20 22:08:21.892047	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763651300/fashion_ecommerce/suppliers/Teelab/logo/Hello.png	0933565258
6f9db9da-e2f3-4a55-94f6-c265c8b42849	Hapas	hapas@gmail.com	2025-11-20 22:08:38.493817	2025-11-20 22:08:38.493817	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763651316/fashion_ecommerce/suppliers/Hapas/logo/Hello.png	0933565258
6724ad07-bcf9-43f1-8030-69b644167e8d	IMelon	imelon@gmail.com	2025-11-20 22:09:04.168244	2025-11-20 22:09:04.168244	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763651342/fashion_ecommerce/suppliers/IMelon/logo/Hello.png	0933565258
ee9a160e-1810-4411-bb4e-ab931cb09079	Coolmate	phucphan01866@gmail.com	2025-11-20 20:21:05.754297	2025-11-22 00:22:30.788919	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763644863/fashion_ecommerce/suppliers/Coolmate/logo/Hello.png	0933565258
15cc9677-b31e-4190-98a9-fb3c6ad713de	Lesac	lesac@supplier.com	2025-11-22 00:25:29.782192	2025-11-22 00:25:29.782192	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763745933/fashion_ecommerce/suppliers/Lesac/logo/i2na5tsx0gpaetiqrspk.webp	0933565258
b97497a9-fdce-486e-bbac-7b83f681a12f	UNDERTHINKER	underthinker@supplier.com	2025-11-22 00:28:45.926346	2025-11-22 00:28:45.926346	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746130/fashion_ecommerce/suppliers/UNDERTHINKER/logo/nyum1qrkbbuu9mhrxfvc.webp	0553940096
c3571caf-d719-4e34-a30f-483b36e9b4e0	Rockbros	rockbros@gmail.com	2025-11-22 00:29:06.599798	2025-11-22 00:29:06.599798	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746150/fashion_ecommerce/suppliers/Rockbros/logo/tztsef4j2teh0qm3is1y.png	0933565258
95f09dbf-4a08-4da3-91d0-bb59c17d3138	Lilywear	lilywear@gmail.com	2025-11-22 00:33:29.754528	2025-11-22 00:33:29.754528	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763746413/fashion_ecommerce/suppliers/Lilywear/logo/ju1yhzajsueinbjcdi7d.png	0933565258
e1399e40-b775-47ee-977d-9c2b7ec07131	Vintino	vintino@supplier.com	2025-11-22 23:31:10.252144	2025-11-22 23:31:10.252144	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763829076/fashion_ecommerce/suppliers/Vintino/logo/mfwkpuecab2px386ghoy.webp	0933565258
845a0b36-8552-4a05-af91-bae94ef9c37b	SEEME	seeme@supplier.com	2025-11-23 00:46:31.639535	2025-11-23 00:46:31.639535	https://res.cloudinary.com/dge8dkqyt/image/upload/v1763833598/fashion_ecommerce/suppliers/SEEME/logo/prdnha9lb0juf2el5i5g.webp	0933565258
\.


--
-- TOC entry 5360 (class 0 OID 17412)
-- Dependencies: 297
-- Data for Name: user_addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_addresses (id, user_id, receive_name, phone, address, is_default, created_at, updated_at, tag) FROM stdin;
194c943f-55c7-4e77-8959-709391482a87	eba218de-6fdf-44bb-b443-8d8e7e707afc	Trần Phương Dương	0774546059	9b Trịnh Hoài Đức, Phường Thủ Đức, Thành phố Hồ Chí Minh	t	2025-11-25 10:33:08.428752	2025-11-25 10:33:08.428752	Nhà
719a8241-550b-4cdc-bb03-c4f4c99cc147	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:35:50.609917	2025-11-25 10:35:50.609917	\N
50060f05-6bea-4249-92c7-55480db71e5b	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:36:15.425371	2025-11-25 10:36:15.425371	\N
220fe0a0-02a1-48c7-9f5a-2f3d641ace47	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:31.050639	2025-11-25 10:43:31.050639	\N
031a1ab8-ad56-4401-93ac-ffc05ee7790f	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:31.091749	2025-11-25 10:43:31.091749	\N
c8e7f56a-ca51-4130-952e-c3723567f738	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:33.505323	2025-11-25 10:43:33.505323	\N
f2cf48f1-348f-4a9b-8e1a-0765c3f55256	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:37.020437	2025-11-25 10:43:37.020437	\N
601e224c-3075-498d-9b7a-c67a309aa3a4	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:37.036747	2025-11-25 10:43:37.036747	\N
5bf32cb4-bd90-4a90-8ac9-aab2417edf8d	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:39.077413	2025-11-25 10:43:39.077413	\N
651f2e2e-7f44-4f72-9586-f755e963e36d	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:44.451405	2025-11-25 10:43:44.451405	\N
d788ce6e-fc4b-4d09-8b11-1c6cdba43c82	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:44.466297	2025-11-25 10:43:44.466297	\N
b107db1a-be81-45ea-bdec-bad3c12983bd	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:43:48.273331	2025-11-25 10:43:48.273331	\N
6e996bbf-530c-4956-a66a-0d9c65343d7e	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:44:00.88889	2025-11-25 10:44:00.88889	\N
e9e26624-cb43-459c-9dd5-816908484a91	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:47:15.575175	2025-11-25 10:47:15.575175	\N
437c356d-033d-4124-aafa-4a0bb6a9ee69	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:47:15.579146	2025-11-25 10:47:15.579146	\N
9d500185-7624-495d-aaf3-79088862125a	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:47:20.451786	2025-11-25 10:47:20.451786	\N
65abbcda-66d8-4989-8ed3-88a1506b0cc9	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 10:47:45.629347	2025-11-25 10:47:45.629347	\N
57bb97b4-8a7e-4c4b-9ad5-1dd4843e0c09	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:05:39.930493	2025-11-25 14:05:39.930493	\N
48e299a7-9547-4be5-a065-cc564498e8ee	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:05:39.937129	2025-11-25 14:05:39.937129	\N
170554d2-47c2-4e49-a863-054afa67a9df	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:05:42.737983	2025-11-25 14:05:42.737983	\N
14a585e1-d575-4682-8a11-64e66fe6c487	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:05:44.976355	2025-11-25 14:05:44.976355	\N
c6bf934f-a022-492f-b192-cc4641c6461d	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:06:21.816496	2025-11-25 14:06:21.816496	\N
57b191d5-f535-4dbf-a1bb-6b46be50a381	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:12:30.549039	2025-11-25 14:12:30.549039	\N
a5dd5473-12b4-4e61-b357-54659eca76e2	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:12:30.611976	2025-11-25 14:12:30.611976	\N
c6d81444-b0c6-4219-887d-6f001235b71d	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:12:35.28658	2025-11-25 14:12:35.28658	\N
2f1d7317-730b-41ee-96ea-0f7b4dc38b72	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:12:55.517147	2025-11-25 14:12:55.517147	\N
afa68745-2ff4-49ec-b04e-4e4d908a40b4	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:16:10.288075	2025-11-25 14:16:10.288075	\N
00582d10-a969-485b-9ab8-4ac8b1f263a9	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:16:10.354617	2025-11-25 14:16:10.354617	\N
4a9a75d0-523e-4b97-88f8-17b6497872de	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:16:14.485828	2025-11-25 14:16:14.485828	\N
0e8fd93e-9242-40ad-8223-c98ec0f23c32	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:19:20.743916	2025-11-25 14:19:20.743916	\N
24063286-0ca2-4fab-9817-64834681a2b2	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:26:40.083813	2025-11-25 14:26:40.083813	\N
b9da77d9-95cc-403e-b7c0-8306baf79d78	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:26:40.170754	2025-11-25 14:26:40.170754	\N
12a82279-b70f-4f08-9030-25d1d903bdd1	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 14:26:45.644209	2025-11-25 14:26:45.644209	\N
c2ffafd2-279e-4f76-8444-7b521567a818	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 15:56:44.30069	2025-11-25 15:56:44.30069	\N
777e4230-062f-4188-87f2-8a13854d5bfb	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:05:02.752336	2025-11-25 16:05:02.752336	\N
debfbf2c-dc30-47e8-8e67-314d2f85e3c1	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:05:02.755784	2025-11-25 16:05:02.755784	\N
5b88e4f9-8acc-401e-b256-9c3b971f1dc9	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:05:05.608512	2025-11-25 16:05:05.608512	\N
a55c7a7d-aea2-4d3f-9558-9573ccabb658	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:05:14.20926	2025-11-25 16:05:14.20926	\N
7c367601-ba1c-4886-b01b-0a690325ade7	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:05:14.210901	2025-11-25 16:05:14.210901	\N
89ee600d-1189-4290-bfa4-395d6f64b352	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:05:16.485588	2025-11-25 16:05:16.485588	\N
84dff1d2-1286-4697-8e7b-47d7803a4c4d	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:06:50.320082	2025-11-25 16:06:50.320082	\N
148b9234-d31d-49d1-9e75-9f431db1dc51	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:06:53.185294	2025-11-25 16:06:53.185294	\N
1e9ced96-ce19-4d38-b442-0b39b557bb81	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:06:57.741212	2025-11-25 16:06:57.741212	\N
cf6b0ea3-6bf9-40ac-94b3-f1aa0d24bf03	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:07:20.457429	2025-11-25 16:07:20.457429	\N
46618411-98d0-4f28-b86e-683a97db8c11	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:07:25.960451	2025-11-25 16:07:25.960451	\N
016f5305-ae62-4c4e-8523-db81d8e558ee	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:07:25.965591	2025-11-25 16:07:25.965591	\N
32bed7c5-85a2-48d6-82f8-5eec59a07d3e	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:07:28.946225	2025-11-25 16:07:28.946225	\N
c739530f-e54c-44d4-8771-3abc94646744	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:09:35.786766	2025-11-25 16:09:35.786766	\N
94159daf-2159-4558-b271-838108fdc0d3	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:10:06.062081	2025-11-25 16:10:06.062081	\N
81222818-852c-4ee4-9441-9cfd7aa7c5cf	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:14:44.335709	2025-11-25 16:14:44.335709	\N
3b550f31-c71f-46b2-9fc2-3b576e2aa13a	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:14:46.439264	2025-11-25 16:14:46.439264	\N
33396002-b233-4bde-9bc9-a7568c599e54	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:16:23.183605	2025-11-25 16:16:23.183605	\N
29fc803c-c439-45ea-8bae-c92188b5c2d3	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:25:53.704189	2025-11-25 16:25:53.704189	\N
158baf29-eadb-4f16-a1db-e5e3bf0b56c5	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:25:53.798962	2025-11-25 16:25:53.798962	\N
2c0722cf-2689-4cd0-9a7a-a7d1a1668f96	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:26:06.97124	2025-11-25 16:26:06.97124	\N
c8ca3e1e-03c0-4f61-a85b-e984a96c6703	eba218de-6fdf-44bb-b443-8d8e7e707afc	\N	\N	\N	f	2025-11-25 16:26:06.988205	2025-11-25 16:26:06.988205	\N
\.


--
-- TOC entry 5361 (class 0 OID 17422)
-- Dependencies: 298
-- Data for Name: user_behavior_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_behavior_events (id, user_id, event_type, metadata, created_at) FROM stdin;
9ebec18a-277c-4e48-bac4-948653dd8ab1	\N	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:12:33.567927+07
f81af92c-e774-4588-85d4-43e5ec70fde4	\N	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:17:43.419349+07
fad3c4a5-8f2e-4568-b625-b16ea1318e7b	\N	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:19:50.85722+07
dc933c46-d9d5-426d-a221-0d3cdb1ddaf5	\N	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:21:44.456327+07
1826d636-8030-4f93-8682-3ec9539c2820	\N	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:21:47.948939+07
c72ad374-8097-4735-946a-600d6ebe1e37	\N	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:22:59.113338+07
22a521dc-143b-4060-8510-23be5afc2ff9	eba218de-6fdf-44bb-b443-8d8e7e707afc	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:25:32.799653+07
4fcfe6f8-12ae-4876-8617-c3fa071be007	eba218de-6fdf-44bb-b443-8d8e7e707afc	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{{session_id}}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:30:08.501662+07
f2c75e38-1475-4cec-bb4f-414189b77032	eba218de-6fdf-44bb-b443-8d8e7e707afc	view	{"page": "product_detail", "device": "website", "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb", "session_id": "{session_id}", "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"}	2025-11-22 17:30:28.241909+07
\.


--
-- TOC entry 5362 (class 0 OID 17429)
-- Dependencies: 299
-- Data for Name: user_promotions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_promotions (id, user_id, promotion_id, action, created_at, code) FROM stdin;
6003b3cb-e29d-4467-ba8c-48e7d4657c1d	eba218de-6fdf-44bb-b443-8d8e7e707afc	5e1b0e25-f789-4a31-9ec9-f1706ec49848	collected	2025-11-25 10:35:50.587161	BLACKFRIDAY
2743aa09-0b8d-4200-bdbb-f7d7afe39c4f	eba218de-6fdf-44bb-b443-8d8e7e707afc	5e1b0e25-f789-4a31-9ec9-f1706ec49848	used	2025-11-25 15:56:44.259117	BLACKFRIDAY
\.


--
-- TOC entry 5363 (class 0 OID 17435)
-- Dependencies: 300
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, full_name, phone, role, status, created_at, updated_at, google_id, name, height, weight, bust, waist, hip, gender) FROM stdin;
f849cc09-e4e9-4bd2-a931-0cbc2a3e0b8d	n21dcpt075@student.ptithcm.edu.vn	\N	\N	\N	customer	active	2025-11-20 20:17:04.153486	2025-11-20 20:17:04.153486	118164697697544835125	D21CQPT01-N PHAN HUU THIEN PHUC	\N	\N	\N	\N	\N	\N
21dae0c0-22e1-4401-a6bc-63fa8aaf5415	phucphan01866@gmail.com	$2b$10$TGWGewxbokzYn0bp.LRqD.prPM.1csVNfGDDAuUX9fVgep7.0SwVq	Phan Hữu Thiên Phúc	0933565258	admin	active	2025-11-20 20:16:07.125101	2025-11-20 20:17:38.164398	110343194328629319107	\N	\N	\N	\N	\N	\N	\N
94bc8dc2-224c-4b3f-ae8f-48ac5b4246c5	duongtran.09012003@gmail.com	\N	\N	\N	customer	active	2025-11-21 14:23:18.922376	2025-11-21 14:23:18.922376	105926624557033622346	Duong Tran	\N	\N	\N	\N	\N	\N
40685da8-f6f5-48e9-82d5-ef79ab165c6d	phuongduong@admin.com	$2b$10$IyLCeEv2MM2LRl.YcPaB6.XteROAfQ9kG1VmzHAYE39WJxeKL3zpa	Trần Phương Dương	0774546059	admin	active	2025-11-21 14:28:35.645651	2025-11-21 14:29:20.288529	\N	\N	\N	\N	\N	\N	\N	\N
eba218de-6fdf-44bb-b443-8d8e7e707afc	tranduong.09012003@gmail.com	$2b$10$5cp4ZFBC.cIsmhY.KYpfluit0U.wzibyolo2F5ZDmQeSol9M2nF1S	Trần Phương Dương	0774546059	customer	active	2025-11-22 17:03:17.039625	2025-11-23 22:46:13.667659	\N	\N	170	64	100	70	95	\N
\.


--
-- TOC entry 5402 (class 0 OID 0)
-- Dependencies: 279
-- Name: favorite_seq_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.favorite_seq_seq', 1, true);


--
-- TOC entry 5403 (class 0 OID 0)
-- Dependencies: 291
-- Name: products_sequence_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_sequence_id_seq', 109, true);


--
-- TOC entry 5049 (class 2606 OID 17467)
-- Name: ai_chat_messages ai_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_chat_messages
    ADD CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 5053 (class 2606 OID 17469)
-- Name: ai_chat_sessions ai_chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_chat_sessions
    ADD CONSTRAINT ai_chat_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5056 (class 2606 OID 17471)
-- Name: ai_recommendations ai_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_recommendations
    ADD CONSTRAINT ai_recommendations_pkey PRIMARY KEY (id);


--
-- TOC entry 5061 (class 2606 OID 17473)
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5063 (class 2606 OID 17475)
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- TOC entry 5065 (class 2606 OID 17477)
-- Name: carts carts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_key UNIQUE (user_id);


--
-- TOC entry 5067 (class 2606 OID 17479)
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- TOC entry 5071 (class 2606 OID 17481)
-- Name: favorite favorite_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.favorite
    ADD CONSTRAINT favorite_pkey PRIMARY KEY (id);


--
-- TOC entry 5087 (class 2606 OID 17483)
-- Name: news news_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);


--
-- TOC entry 5090 (class 2606 OID 17485)
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5092 (class 2606 OID 17487)
-- Name: order_notifications order_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_notifications
    ADD CONSTRAINT order_notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 5080 (class 2606 OID 17489)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- TOC entry 5096 (class 2606 OID 17491)
-- Name: otp_verifications otp_verifications_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_email_key UNIQUE (email);


--
-- TOC entry 5098 (class 2606 OID 17493)
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);


--
-- TOC entry 5084 (class 2606 OID 17495)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5101 (class 2606 OID 17497)
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- TOC entry 5104 (class 2606 OID 17499)
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- TOC entry 5107 (class 2606 OID 17501)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- TOC entry 5109 (class 2606 OID 17503)
-- Name: products products_sequence_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sequence_id_key UNIQUE (sequence_id);


--
-- TOC entry 5111 (class 2606 OID 17505)
-- Name: promotion_products promotion_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_products
    ADD CONSTRAINT promotion_products_pkey PRIMARY KEY (promotion_id, product_id);


--
-- TOC entry 5113 (class 2606 OID 17507)
-- Name: promotions promotions_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_code_key UNIQUE (code);


--
-- TOC entry 5115 (class 2606 OID 17509)
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- TOC entry 5117 (class 2606 OID 17511)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5119 (class 2606 OID 17513)
-- Name: refresh_tokens refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);


--
-- TOC entry 5121 (class 2606 OID 17515)
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- TOC entry 5146 (class 2606 OID 17791)
-- Name: size_guides size_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.size_guides
    ADD CONSTRAINT size_guides_pkey PRIMARY KEY (id);


--
-- TOC entry 5123 (class 2606 OID 17517)
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- TOC entry 5069 (class 2606 OID 17519)
-- Name: categories unique_category_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT unique_category_name UNIQUE (name);


--
-- TOC entry 5148 (class 2606 OID 17801)
-- Name: size_guides unique_size_guide_per_category; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.size_guides
    ADD CONSTRAINT unique_size_guide_per_category UNIQUE (category_id, size_label);


--
-- TOC entry 5125 (class 2606 OID 17521)
-- Name: suppliers unique_supplier_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT unique_supplier_name UNIQUE (name);


--
-- TOC entry 5076 (class 2606 OID 17523)
-- Name: favorite uq_favorite_user_product; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.favorite
    ADD CONSTRAINT uq_favorite_user_product UNIQUE (user_id, product_id);


--
-- TOC entry 5133 (class 2606 OID 17525)
-- Name: user_promotions uq_user_promotion_action; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_promotions
    ADD CONSTRAINT uq_user_promotion_action UNIQUE (user_id, promotion_id, action);


--
-- TOC entry 5127 (class 2606 OID 17527)
-- Name: user_addresses user_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);


--
-- TOC entry 5130 (class 2606 OID 17529)
-- Name: user_behavior_events user_behavior_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_behavior_events
    ADD CONSTRAINT user_behavior_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5135 (class 2606 OID 17531)
-- Name: user_promotions user_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_promotions
    ADD CONSTRAINT user_promotions_pkey PRIMARY KEY (id);


--
-- TOC entry 5138 (class 2606 OID 17533)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 5140 (class 2606 OID 17535)
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- TOC entry 5142 (class 2606 OID 17537)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5050 (class 1259 OID 17804)
-- Name: idx_ai_chat_messages_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_chat_messages_created_at ON public.ai_chat_messages USING btree (created_at);


--
-- TOC entry 5051 (class 1259 OID 17803)
-- Name: idx_ai_chat_messages_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_chat_messages_session_id ON public.ai_chat_messages USING btree (session_id, created_at);


--
-- TOC entry 5054 (class 1259 OID 17802)
-- Name: idx_ai_chat_sessions_user_id_last; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_chat_sessions_user_id_last ON public.ai_chat_sessions USING btree (user_id, last_message_at DESC);


--
-- TOC entry 5057 (class 1259 OID 17811)
-- Name: idx_ai_recommendations_items_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_recommendations_items_gin ON public.ai_recommendations USING gin (items);


--
-- TOC entry 5058 (class 1259 OID 17812)
-- Name: idx_ai_recommendations_model; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_recommendations_model ON public.ai_recommendations USING btree (model_version);


--
-- TOC entry 5059 (class 1259 OID 17810)
-- Name: idx_ai_recommendations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_recommendations_user_id ON public.ai_recommendations USING btree (user_id);


--
-- TOC entry 5128 (class 1259 OID 17843)
-- Name: idx_behavior_user_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_behavior_user_type ON public.user_behavior_events USING btree (user_id, event_type);


--
-- TOC entry 5072 (class 1259 OID 17538)
-- Name: idx_favorite_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_favorite_product_id ON public.favorite USING btree (product_id);


--
-- TOC entry 5073 (class 1259 OID 17539)
-- Name: idx_favorite_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_favorite_user_id ON public.favorite USING btree (user_id);


--
-- TOC entry 5074 (class 1259 OID 17540)
-- Name: idx_favorite_user_seq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_favorite_user_seq ON public.favorite USING btree (user_id, seq);


--
-- TOC entry 5088 (class 1259 OID 17541)
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- TOC entry 5077 (class 1259 OID 17542)
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- TOC entry 5078 (class 1259 OID 17543)
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);


--
-- TOC entry 5094 (class 1259 OID 17544)
-- Name: idx_otp_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_email ON public.otp_verifications USING btree (email);


--
-- TOC entry 5081 (class 1259 OID 17545)
-- Name: idx_payments_gateway_tx_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_gateway_tx_id ON public.payments USING btree (gateway_tx_id);


--
-- TOC entry 5082 (class 1259 OID 17546)
-- Name: idx_payments_paid_at_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_paid_at_status ON public.payments USING btree (paid_at) WHERE ((status)::text = 'succeeded'::text);


--
-- TOC entry 5099 (class 1259 OID 17547)
-- Name: idx_product_images_product_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_images_product_position ON public.product_images USING btree (product_id, variant_id, "position");


--
-- TOC entry 5102 (class 1259 OID 17548)
-- Name: idx_product_variants_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_variants_product_id ON public.product_variants USING btree (product_id);


--
-- TOC entry 5105 (class 1259 OID 17549)
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_name ON public.products USING btree (name);


--
-- TOC entry 5143 (class 1259 OID 17798)
-- Name: idx_size_guides_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_size_guides_category ON public.size_guides USING btree (category_id);


--
-- TOC entry 5144 (class 1259 OID 17799)
-- Name: idx_size_guides_size_label; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_size_guides_size_label ON public.size_guides USING btree (size_label);


--
-- TOC entry 5131 (class 1259 OID 17550)
-- Name: idx_user_promotions_user_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_promotions_user_action ON public.user_promotions USING btree (user_id, action);


--
-- TOC entry 5136 (class 1259 OID 17551)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 5085 (class 1259 OID 17686)
-- Name: mv_revenue_by_week_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX mv_revenue_by_week_uidx ON public.mv_revenue_by_week USING btree (week_start);


--
-- TOC entry 5093 (class 1259 OID 17552)
-- Name: ux_order_notifications_order_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_order_notifications_order_type ON public.order_notifications USING btree (order_id, type);


--
-- TOC entry 5178 (class 2620 OID 17553)
-- Name: news trigger_update_news; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_news BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5176 (class 2620 OID 17554)
-- Name: orders trigger_update_orders; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5177 (class 2620 OID 17555)
-- Name: payments trigger_update_payments; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_payments BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5175 (class 2620 OID 17556)
-- Name: categories trigger_updated_categories; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_categories BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5179 (class 2620 OID 17557)
-- Name: product_variants trigger_updated_product_variants; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_product_variants BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5180 (class 2620 OID 17558)
-- Name: products trigger_updated_products; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5184 (class 2620 OID 17797)
-- Name: size_guides trigger_updated_size_guides; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_size_guides BEFORE UPDATE ON public.size_guides FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5181 (class 2620 OID 17559)
-- Name: suppliers trigger_updated_suppliers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_suppliers BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5182 (class 2620 OID 17560)
-- Name: user_addresses trigger_updated_user_addresses; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_user_addresses BEFORE UPDATE ON public.user_addresses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5183 (class 2620 OID 17561)
-- Name: users trigger_updated_users; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_updated_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- TOC entry 5149 (class 2606 OID 17562)
-- Name: ai_chat_messages ai_chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_chat_messages
    ADD CONSTRAINT ai_chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE;


--
-- TOC entry 5150 (class 2606 OID 17567)
-- Name: ai_chat_sessions ai_chat_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_chat_sessions
    ADD CONSTRAINT ai_chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5152 (class 2606 OID 17572)
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- TOC entry 5153 (class 2606 OID 17577)
-- Name: cart_items cart_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- TOC entry 5154 (class 2606 OID 17582)
-- Name: carts carts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5155 (class 2606 OID 17587)
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id);


--
-- TOC entry 5151 (class 2606 OID 17805)
-- Name: ai_recommendations fk_ai_recommendations_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_recommendations
    ADD CONSTRAINT fk_ai_recommendations_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5156 (class 2606 OID 17592)
-- Name: orders fk_promotion; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_promotion FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;


--
-- TOC entry 5159 (class 2606 OID 17597)
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 5160 (class 2606 OID 17602)
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- TOC entry 5157 (class 2606 OID 17607)
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5158 (class 2606 OID 17612)
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 5161 (class 2606 OID 17617)
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5162 (class 2606 OID 17622)
-- Name: product_images product_images_variant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_variant_fk FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- TOC entry 5163 (class 2606 OID 17627)
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5164 (class 2606 OID 17632)
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- TOC entry 5165 (class 2606 OID 17637)
-- Name: products products_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- TOC entry 5166 (class 2606 OID 17642)
-- Name: promotion_products promotion_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_products
    ADD CONSTRAINT promotion_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5167 (class 2606 OID 17647)
-- Name: promotion_products promotion_products_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_products
    ADD CONSTRAINT promotion_products_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 5168 (class 2606 OID 17652)
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5169 (class 2606 OID 17657)
-- Name: reviews reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- TOC entry 5170 (class 2606 OID 17662)
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 5174 (class 2606 OID 17792)
-- Name: size_guides size_guides_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.size_guides
    ADD CONSTRAINT size_guides_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- TOC entry 5171 (class 2606 OID 17667)
-- Name: user_addresses user_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_addresses
    ADD CONSTRAINT user_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5172 (class 2606 OID 17672)
-- Name: user_promotions user_promotions_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_promotions
    ADD CONSTRAINT user_promotions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- TOC entry 5173 (class 2606 OID 17677)
-- Name: user_promotions user_promotions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_promotions
    ADD CONSTRAINT user_promotions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5371 (class 0 OID 0)
-- Dependencies: 272
-- Name: TABLE ai_chat_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_chat_messages TO teammate1;


--
-- TOC entry 5372 (class 0 OID 0)
-- Dependencies: 273
-- Name: TABLE ai_chat_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_chat_sessions TO teammate1;


--
-- TOC entry 5373 (class 0 OID 0)
-- Dependencies: 274
-- Name: TABLE ai_recommendations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_recommendations TO teammate1;


--
-- TOC entry 5374 (class 0 OID 0)
-- Dependencies: 275
-- Name: TABLE cart_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cart_items TO teammate1;


--
-- TOC entry 5375 (class 0 OID 0)
-- Dependencies: 276
-- Name: TABLE carts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.carts TO teammate1;


--
-- TOC entry 5376 (class 0 OID 0)
-- Dependencies: 277
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.categories TO teammate1;


--
-- TOC entry 5378 (class 0 OID 0)
-- Dependencies: 279
-- Name: SEQUENCE favorite_seq_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.favorite_seq_seq TO teammate1;


--
-- TOC entry 5379 (class 0 OID 0)
-- Dependencies: 280
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.orders TO teammate1;


--
-- TOC entry 5380 (class 0 OID 0)
-- Dependencies: 281
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payments TO teammate1;


--
-- TOC entry 5381 (class 0 OID 0)
-- Dependencies: 285
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_items TO teammate1;


--
-- TOC entry 5382 (class 0 OID 0)
-- Dependencies: 286
-- Name: TABLE order_notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_notifications TO teammate1;


--
-- TOC entry 5383 (class 0 OID 0)
-- Dependencies: 287
-- Name: TABLE otp_verifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.otp_verifications TO teammate1;


--
-- TOC entry 5384 (class 0 OID 0)
-- Dependencies: 288
-- Name: TABLE product_images; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.product_images TO teammate1;


--
-- TOC entry 5385 (class 0 OID 0)
-- Dependencies: 289
-- Name: TABLE product_variants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.product_variants TO teammate1;


--
-- TOC entry 5386 (class 0 OID 0)
-- Dependencies: 290
-- Name: TABLE products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.products TO teammate1;


--
-- TOC entry 5388 (class 0 OID 0)
-- Dependencies: 291
-- Name: SEQUENCE products_sequence_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.products_sequence_id_seq TO teammate1;


--
-- TOC entry 5389 (class 0 OID 0)
-- Dependencies: 292
-- Name: TABLE promotion_products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.promotion_products TO teammate1;


--
-- TOC entry 5390 (class 0 OID 0)
-- Dependencies: 293
-- Name: TABLE promotions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.promotions TO teammate1;


--
-- TOC entry 5391 (class 0 OID 0)
-- Dependencies: 294
-- Name: TABLE refresh_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.refresh_tokens TO teammate1;


--
-- TOC entry 5392 (class 0 OID 0)
-- Dependencies: 295
-- Name: TABLE reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reviews TO teammate1;


--
-- TOC entry 5393 (class 0 OID 0)
-- Dependencies: 304
-- Name: TABLE size_guides; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.size_guides TO teammate1;


--
-- TOC entry 5394 (class 0 OID 0)
-- Dependencies: 296
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.suppliers TO teammate1;


--
-- TOC entry 5395 (class 0 OID 0)
-- Dependencies: 297
-- Name: TABLE user_addresses; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_addresses TO teammate1;


--
-- TOC entry 5396 (class 0 OID 0)
-- Dependencies: 298
-- Name: TABLE user_behavior_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_behavior_events TO teammate1;


--
-- TOC entry 5397 (class 0 OID 0)
-- Dependencies: 299
-- Name: TABLE user_promotions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_promotions TO teammate1;


--
-- TOC entry 5398 (class 0 OID 0)
-- Dependencies: 300
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO teammate1;


--
-- TOC entry 5399 (class 0 OID 0)
-- Dependencies: 302
-- Name: TABLE v_item_document; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_item_document TO teammate1;


--
-- TOC entry 5400 (class 0 OID 0)
-- Dependencies: 303
-- Name: TABLE v_product_full; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_product_full TO teammate1;


--
-- TOC entry 5401 (class 0 OID 0)
-- Dependencies: 305
-- Name: TABLE vw_top_recommended_outfits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vw_top_recommended_outfits TO teammate1;


--
-- TOC entry 2235 (class 826 OID 17748)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO teammate1;


--
-- TOC entry 5346 (class 0 OID 17301)
-- Dependencies: 283 5366
-- Name: mv_revenue_by_week; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: postgres
--

REFRESH MATERIALIZED VIEW public.mv_revenue_by_week;


-- Completed on 2025-11-25 21:54:14

--
-- PostgreSQL database dump complete
--

