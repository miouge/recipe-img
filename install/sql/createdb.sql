
--------------------------------------------------------

DROP TABLE IF EXISTS public.language CASCADE;

CREATE TABLE IF NOT EXISTS language
(
  idlng SMALLSERIAL PRIMARY KEY,
  iso639_1 VARCHAR(2),
  iso639_2 VARCHAR(3),
  iso639_3 VARCHAR(3),
  local_name TEXT,
  english_name TEXT,
  enabled SMALLINT
  
) TABLESPACE cloud;

INSERT INTO language( iso639_1, iso639_2, iso639_3, local_name, english_name, enabled ) values( NULL, NULL, NULL, 'English', 'English', 1 );
INSERT INTO language( iso639_1, iso639_2, iso639_3, local_name, english_name, enabled ) values( NULL, NULL, NULL, 'Francais', 'French', 1 );

--------------------------------------------------------

DROP TABLE IF EXISTS public.login CASCADE;
CREATE TABLE IF NOT EXISTS login
(
  idlog SERIAL PRIMARY KEY,
  login TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT,
  firstname TEXT, -- prenom
  surname TEXT,   -- nom de famille
  tzdisplay TEXT,
  status SMALLINT, -- waiting to confirm his email (2:ok)
  dateend TIMESTAMP, -- date de fin abonnement
  datecreate TIMESTAMP,
  dateupdate TIMESTAMP,
  idlng SMALLINT REFERENCES language(idlng),
  UNIQUE( login )
  
) TABLESPACE cloud; 

INSERT INTO login( login, password, email, firstname, surname, tzdisplay, idlng, status, datecreate, dateupdate ) 
values(  'pri', '456', 'miouge@free.fr', 'Philippe', 'RIPOLL', 'Europe/Paris', 2, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP );

--------------------------------------------------------

DROP TABLE IF EXISTS public.session CASCADE;
CREATE TABLE IF NOT EXISTS session
(

  idlog INTEGER PRIMARY KEY REFERENCES login(idlog),
  lsessionid VARCHAR(255),
  datecreate TIMESTAMP,
  dateaccess TIMESTAMP

) TABLESPACE cloud; 

--------------------------------------------------------

