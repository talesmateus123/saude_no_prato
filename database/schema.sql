CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    enrollment VARCHAR(80) NOT NULL,
    access_code CHAR(10) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    birth_date DATE NULL,
    gender VARCHAR(80) NOT NULL DEFAULT '',
    guardian_name VARCHAR(180) NOT NULL DEFAULT '',
    guardian_phone VARCHAR(60) NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ativo',
    UNIQUE KEY uq_students_enrollment (enrollment),
    UNIQUE KEY uq_students_access_code (access_code),
    KEY ix_students_status_class (status, class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_restrictions (
    student_id BIGINT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL,
    restriction_text VARCHAR(500) NOT NULL,
    PRIMARY KEY (student_id, position),
    CONSTRAINT fk_restrictions_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardians (
    guardian_key VARCHAR(64) NOT NULL PRIMARY KEY,
    payload JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_students (
    guardian_key VARCHAR(64) NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (guardian_key, student_id),
    CONSTRAINT fk_guardian_students_guardian FOREIGN KEY (guardian_key) REFERENCES guardians (guardian_key) ON DELETE CASCADE,
    CONSTRAINT fk_guardian_students_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    menu_date DATE NOT NULL,
    meal_type VARCHAR(32) NOT NULL,
    meal TEXT NOT NULL,
    dessert TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    UNIQUE KEY uq_menu_date_type (menu_date, meal_type),
    KEY ix_menu_date_status (menu_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_item_allergens (
    menu_item_id VARCHAR(64) NOT NULL,
    position INT UNSIGNED NOT NULL,
    allergen VARCHAR(255) NOT NULL,
    PRIMARY KEY (menu_item_id, position),
    CONSTRAINT fk_allergens_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    attendance_date DATE NOT NULL,
    attendance_time VARCHAR(12) NOT NULL,
    method VARCHAR(80) NOT NULL,
    UNIQUE KEY uq_attendance_student_date (student_id, attendance_date),
    KEY ix_attendance_date (attendance_date),
    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_meals (
    attendance_id BIGINT UNSIGNED NOT NULL,
    meal_type VARCHAR(32) NOT NULL,
    PRIMARY KEY (attendance_id, meal_type),
    CONSTRAINT fk_attendance_meals_attendance FOREIGN KEY (attendance_id) REFERENCES attendance (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_selections (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    selection_date DATE NOT NULL,
    UNIQUE KEY uq_meal_selection_student_date (student_id, selection_date),
    CONSTRAINT fk_meal_selections_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_selection_items (
    selection_id BIGINT UNSIGNED NOT NULL,
    meal_type VARCHAR(32) NOT NULL,
    PRIMARY KEY (selection_id, meal_type),
    CONSTRAINT fk_meal_selection_items_selection FOREIGN KEY (selection_id) REFERENCES meal_selections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    body TEXT NOT NULL,
    date_label VARCHAR(80) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_options (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    prepared INT UNSIGNED NOT NULL DEFAULT 0,
    consumed INT UNSIGNED NOT NULL DEFAULT 0,
    sort_position TINYINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_option_daily (
    activity_date DATE NOT NULL,
    meal_option_id VARCHAR(32) NOT NULL,
    prepared INT UNSIGNED NOT NULL DEFAULT 0,
    consumed INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (activity_date, meal_option_id),
    CONSTRAINT fk_meal_option_daily_option FOREIGN KEY (meal_option_id) REFERENCES meal_options (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
