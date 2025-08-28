CREATE TABLE "bank_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_type" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"connection_data" jsonb,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bill_split_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_split_id" integer NOT NULL,
	"user_id" text,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"amount_owed" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0',
	"is_paid" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bill_splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"description" text,
	"date" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"status" varchar(50) DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer DEFAULT 850 NOT NULL,
	"payment_history" text NOT NULL,
	"utilization" text NOT NULL,
	"age_of_credit" text NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"subcategory" varchar(100),
	"merchant_name" varchar(255),
	"date" timestamp NOT NULL,
	"payment_method" varchar(50),
	"is_recurring" boolean DEFAULT false,
	"tags" text[],
	"notes" text,
	"is_auto_classified" boolean DEFAULT true,
	"confidence" numeric(3, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" integer NOT NULL,
	"current_amount" integer DEFAULT 0 NOT NULL,
	"target_date" timestamp NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"provider" text NOT NULL,
	"product_type" text NOT NULL,
	"category" text NOT NULL,
	"interest_rate" real,
	"term" integer,
	"term_unit" text,
	"monthly_payment" integer,
	"loan_amount" integer,
	"description" text,
	"requirements" jsonb,
	"features" jsonb
);
--> statement-breakpoint
CREATE TABLE "insurance_risks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"risk_level" text NOT NULL,
	"health_risk" text NOT NULL,
	"property_risk" text NOT NULL,
	"auto_risk" text NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"category" varchar(50) NOT NULL,
	"is_read" boolean DEFAULT false,
	"action_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text,
	"timezone" text DEFAULT 'UTC',
	"language" text DEFAULT 'English',
	"profile_picture" text,
	"user_metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_participants" ADD CONSTRAINT "bill_split_participants_bill_split_id_bill_splits_id_fk" FOREIGN KEY ("bill_split_id") REFERENCES "public"."bill_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_participants" ADD CONSTRAINT "bill_split_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_scores" ADD CONSTRAINT "credit_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_risks" ADD CONSTRAINT "insurance_risks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;