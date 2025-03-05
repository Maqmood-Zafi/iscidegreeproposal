from flask import Flask, request, jsonify, session
import pandas as pd
from flask_cors import CORS
import secrets
import os
from copy import deepcopy
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG,
                    format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app)

# Use environment variable for secret key, fallback to random for development
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(16))


class DegreeProposal:
    def __init__(self, data=None):
        if data:
            # Use deepcopy to ensure we have a completely independent copy
            self.disciplines = deepcopy(data.get('disciplines', {"ISCI": []}))
            logging.debug(f"DegreeProposal initialized from session data: {self.disciplines}")
        else:
            self.reset_proposal()
            logging.debug("DegreeProposal initialized with new proposal.")

        try:
            self.courses_df = pd.read_csv('courses.csv', keep_default_na=True, na_values=[''])
            self.courses_df.columns = self.courses_df.columns.str.strip()
            self.courses_df['Course'] = self.courses_df['Course'].astype(str)
            self.courses_df['Course_code'] = self.courses_df['Course_code'].astype(str)
            self.courses_df['Title'] = self.courses_df['Title'].astype(str)
            logging.debug("courses.csv loaded successfully.")
        except Exception as e:
            logging.error(f"Error initializing DegreeProposal: {str(e)}")  # Log as ERROR
            raise

    def reset_proposal(self):
        self.disciplines = {"ISCI": []}
        logging.debug("Proposal reset.")

    def add_discipline(self, discipline_name):
        logging.debug(f"Adding discipline: {discipline_name}")
        if discipline_name != "ISCI" and discipline_name not in self.disciplines:
            self.disciplines[discipline_name] = []
            logging.debug(f"Discipline {discipline_name} added. Disciplines: {self.disciplines}")
            return True
        logging.debug(f"Discipline {discipline_name} NOT added. Disciplines: {self.disciplines}")
        return False

    def remove_discipline(self, discipline_name):
        logging.debug(f"Removing discipline: {discipline_name}")
        if discipline_name != "ISCI" and discipline_name in self.disciplines:
            del self.disciplines[discipline_name]
            logging.debug(f"Discipline {discipline_name} removed. Disciplines: {self.disciplines}")
            return True
        logging.debug(f"Discipline {discipline_name} NOT removed. Disciplines: {self.disciplines}")
        return False

    def add_course(self, discipline_name, course_code):
        logging.debug(f"Adding course: {course_code} to discipline: {discipline_name}")
        if discipline_name not in self.disciplines:
            logging.debug(f"Discipline {discipline_name} not found. Course NOT added.")
            return False

        course_data = self.courses_df[self.courses_df['Course_code'] == course_code]
        if course_data.empty:
            logging.debug(f"Course {course_code} not found in courses.csv. Course NOT added.")
            return False

        if any(course_code in courses for courses in self.disciplines.values()):
            logging.debug(f"Course {course_code} already exists in proposal. Course NOT added.")
            return False

        if discipline_name == "ISCI":
            isci_value = course_data['isci_courses'].iloc[0]
            if pd.isna(isci_value):
                logging.debug(f"Course {course_code} is not a valid ISCI course. Course NOT added.")
                return False

        self.disciplines[discipline_name].append(course_code)
        logging.debug(f"Course {course_code} added to {discipline_name}. Disciplines: {self.disciplines}")
        return True

    def remove_course(self, discipline_name, course_code):
        logging.debug(f"Removing course: {course_code} from discipline: {discipline_name}")
        if discipline_name in self.disciplines:
            if course_code in self.disciplines[discipline_name]:
                self.disciplines[discipline_name].remove(course_code)
                logging.debug(f"Course {course_code} removed. Disciplines: {self.disciplines}")
                return True
        logging.debug(f"Course {course_code} NOT removed. Disciplines: {self.disciplines}")
        return False

    def is_400_level(self, course_code):
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code]
        if course_data.empty:
            return False
        course_num = str(course_data['Course'].iloc[0])
        base_num = ''.join(filter(str.isdigit, course_num.split()[0]))
        return base_num.isdigit() and int(base_num) >= 400

    def get_course_credits(self, course_code):
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code]
        if course_data.empty:
            return {
                'discipline_credit': 0,
                'science_credit': False,
                'science_value': 0,
                'isci_course': False,
                'isci_value': 0,
                'honorary_credit': False,
                'honorary_value': 0
            }

        course_data = course_data.iloc[0]
        science_value = course_data['science_credits']
        honorary_value = course_data['honorary_credits']
        isci_value = course_data['isci_courses']

        return {
            'discipline_credit': float(course_data['discipline_credit']),
            'science_credit': not pd.isna(science_value) and science_value > 0,
            'science_value': float(science_value) if not pd.isna(science_value) else 0,
            'isci_course': not pd.isna(isci_value) and isci_value > 0,
            'isci_value': float(isci_value) if not pd.isna(isci_value) else 0,
            'honorary_credit': not pd.isna(honorary_value) and honorary_value > 0,
            'honorary_value': float(honorary_value) if not pd.isna(honorary_value) else 0
        }

    def validate_proposal(self):
        validation_results = {
            'success': True,
            'messages': [],
            'total_credits': 0,
            'science_credits': 0,
            'isci_credits': 0,
            'honorary_credits': 0,
            'total_400_level_credits': 0,
            'disciplines_400_level': {},
            'non_isci_science_credits': 0,
            'non_isci_honorary_credits': 0,
            'requirements': {
                'discipline_count': {
                    'required': '2-3',
                    'actual': 0,
                    'met': False
                },
                'isci_credits': {
                    'required': 7,
                    'actual': 0,
                    'met': False
                },
                'total_credits': {
                    'required': 33,
                    'actual': 0,
                    'met': False
                },
                'science_credits': {
                    'required': 40,
                    'actual': 0,
                    'met': False
                },
                'non_isci_science_credits': {
                    'required': 27,
                    'actual': 0,
                    'met': False
                },
                'honorary_credits': {
                    'required': '≤ 9',
                    'actual': 0,
                    'met': True
                },
                'total_400_level': {
                    'required': 12,
                    'actual': 0,
                    'met': False
                },
                'disciplines_requirements': {}
            }
        }

        non_isci_disciplines = [d for d in self.disciplines.keys() if d != "ISCI"]
        validation_results['requirements']['discipline_count']['actual'] = len(non_isci_disciplines)
        validation_results['requirements']['discipline_count']['met'] = 2 <= len(non_isci_disciplines) <= 3

        if not validation_results['requirements']['discipline_count']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have 2-3 disciplines (excluding ISCI)")

        for discipline, courses in self.disciplines.items():
            discipline_credits = sum(self.get_course_credits(course)['discipline_credit'] for course in courses)

            validation_results['requirements']['disciplines_requirements'][discipline] = {
                'course_count': {
                    'required': 7 if discipline == "ISCI" else 9,
                    'actual': discipline_credits,
                    'met': discipline_credits >= (7 if discipline == "ISCI" else 9)
                },
                'has_400_level': {
                    'required': True,
                    'actual': False,
                    'met': False
                }
            }

            if (discipline == "ISCI" and discipline_credits < 7) or \
               (discipline != "ISCI" and discipline_credits < 9):
                validation_results['success'] = False
                validation_results['messages'].append(
                    f"Discipline {discipline} must have at least {7 if discipline == 'ISCI' else 9} credits"
                )

            discipline_400_level = sum(1 for course in courses if self.is_400_level(course))
            validation_results['disciplines_400_level'][discipline] = discipline_400_level

            if discipline != "ISCI":
                validation_results['requirements']['disciplines_requirements'][discipline]['has_400_level']['actual'] = discipline_400_level > 0
                validation_results['requirements']['disciplines_requirements'][discipline]['has_400_level']['met'] = discipline_400_level > 0

                if discipline_400_level < 1:
                    validation_results['success'] = False
                    validation_results['messages'].append(f"Discipline {discipline} must have at least one 400-level course")

        total_credits = 0
        non_isci_science_credits = 0
        total_science_credits = 0
        honorary_credits_available = 0
        total_400_level_credits = 0

        for discipline, courses in self.disciplines.items():
            discipline_total = 0
            for course in courses:
                credits = self.get_course_credits(course)

                if self.is_400_level(course):
                    total_400_level_credits += credits['discipline_credit']

                if discipline == "ISCI":
                    if credits['isci_course']:
                        isci_value = credits['isci_value'] or credits['discipline_credit']
                        validation_results['isci_credits'] += isci_value
                        total_science_credits += isci_value
                else:
                    discipline_total += credits['discipline_credit']

                    if credits['science_credit']:
                        science_value = credits['science_value']
                        non_isci_science_credits += science_value
                        total_science_credits += science_value

                    if credits['honorary_credit']:
                        honorary_value = credits['honorary_value']
                        honorary_credits_available += honorary_value
                        validation_results['non_isci_honorary_credits'] = honorary_credits_available

            if discipline != "ISCI":
                total_credits += discipline_total

        honorary_credits_used = min(9, honorary_credits_available)
        validation_results['non_isci_science_credits'] = non_isci_science_credits + honorary_credits_used
        total_science = total_science_credits + honorary_credits_used

        validation_results['requirements']['science_credits']['actual'] = total_science
        validation_results['requirements']['science_credits']['met'] = total_science >= 40
        validation_results['requirements']['non_isci_science_credits']['actual'] = validation_results['non_isci_science_credits']
        validation_results['requirements']['non_isci_science_credits']['met'] = validation_results['non_isci_science_credits'] >= 27
        validation_results['total_credits'] = total_credits
        validation_results['requirements']['total_credits']['actual'] = total_credits
        validation_results['requirements']['total_credits']['met'] = total_credits >= 33
        validation_results['requirements']['isci_credits']['actual'] = validation_results['isci_credits']
        validation_results['requirements']['isci_credits']['met'] = validation_results['isci_credits'] >= 7
        validation_results['requirements']['honorary_credits']['actual'] = validation_results['non_isci_honorary_credits']
        validation_results['requirements']['honorary_credits']['met'] = validation_results['non_isci_honorary_credits'] <= 9
        validation_results['requirements']['total_400_level']['actual'] = validation_results['total_400_level_credits']
        validation_results['requirements']['total_400_level']['met'] = validation_results['total_400_level_credits'] >= 12
        validation_results['total_400_level_credits'] = total_400_level_credits
        validation_results['requirements']['total_400_level']['actual'] = total_400_level_credits
        validation_results['requirements']['total_400_level']['met'] = total_400_level_credits >= 12

        if not validation_results['requirements']['isci_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 7 credits of ISCI courses")

        if not validation_results['requirements']['total_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 33 total credits across non-ISCI disciplines")

        if not validation_results['requirements']['science_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 40 total science credits")

        if not validation_results['requirements']['non_isci_science_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 27 science credits in non-ISCI disciplines")

        if not validation_results['requirements']['honorary_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Maximum 9 honorary credits can count toward the 27 science credits requirement")
        if not validation_results['requirements']['total_400_level']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 12 credits worth of 400-level courses")

        return validation_results
    def search_courses(self, query, limit=10):
        if not query or len(query) < 2:
            return []

        query = query.lower()
        try:
            mask = (
                self.courses_df['Course_code'].str.lower().str.contains(query, na=False) |
                self.courses_df['Title'].str.lower().str.contains(query, na=False)
            )
            matched_courses = self.courses_df[mask]

            matched_courses = matched_courses.sort_values(
                by='Course_code',
                key=lambda x: x.str.lower().str.startswith(query).astype(int),
                ascending=False
            )
            results = [
                {'code': row['Course_code'], 'name': row['Title']}
                for _, row in matched_courses.head(limit).iterrows()
            ]
            return results

        except Exception as e:
            logging.error(f"Error in search_courses: {str(e)}") # Log as ERROR
            return []

    def serialize(self):
        return {
            'disciplines': self.disciplines
        }

    @staticmethod
    def deserialize(data):
        return DegreeProposal(data)

# --- API Endpoints ---

def get_proposal():
    if 'degree_proposal' not in session:
        session['degree_proposal'] = DegreeProposal().serialize()
    return DegreeProposal.deserialize(session['degree_proposal'])

def save_proposal(proposal):
    session['degree_proposal'] = proposal.serialize()
    session.modified = True  # CRITICAL: Mark session as modified!


@app.route('/reset', methods=['POST'])
def reset_proposal():
    try:
        save_proposal(DegreeProposal())
        return jsonify({'success': True, 'message': 'Proposal reset successfully'})
    except Exception as e:
        logging.exception("Error in /reset")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/disciplines', methods=['POST'])
def add_discipline():
    proposal = get_proposal()
    data = request.json
    success = proposal.add_discipline(data['discipline_name'])
    if success:
        save_proposal(proposal)  # save_proposal *now* includes session.modified = True
        results = proposal.validate_proposal()
        return jsonify({'success': success, 'validation': results})
    return jsonify({'success': success})



@app.route('/disciplines/<discipline_name>', methods=['DELETE'])
def remove_discipline(discipline_name):
    proposal = get_proposal()
    success = proposal.remove_discipline(discipline_name)
    if success:
        save_proposal(proposal) # save_proposal *now* includes session.modified = True
        results = proposal.validate_proposal()
        return jsonify({'success': success, 'validation': results})
    return jsonify({'success': success})


@app.route('/courses', methods=['POST'])
def add_course():
    try:
        proposal = get_proposal()
        data = request.json
        success = proposal.add_course(data['discipline_name'], data['course_code'])
        if success:
            save_proposal(proposal) # save_proposal *now* includes session.modified = True
            course_data = proposal.courses_df[proposal.courses_df['Course_code'] == data['course_code']].iloc[0]
            results = proposal.validate_proposal()
            return jsonify({
                'success': success,
                'validation': results,
                'course': {
                    'code': data['course_code'],
                    'title': course_data['Title']
                }
            })
        else:
            return jsonify({'success': False, 'message': 'Course already exists, is invalid, or discipline does not exist.'})
    except Exception as e:
        logging.exception("Error in /courses (POST)")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/courses', methods=['DELETE'])
def remove_course():
    proposal = get_proposal()
    data = request.json
    success = proposal.remove_course(data['discipline_name'], data['course_code'])
    if success:
        save_proposal(proposal) # save_proposal *now* includes session.modified = True
        results = proposal.validate_proposal()
        return jsonify({'success': success, 'validation': results})
    return jsonify({'success': success})


@app.route('/validate', methods=['GET'])
def validate_proposal_route():
    proposal = get_proposal()
    results = proposal.validate_proposal()
    return jsonify(results)


@app.route('/search-courses', methods=['GET'])
def search_courses():
    try:
        proposal = get_proposal()
        query = request.args.get('query', '')
        results = proposal.search_courses(query)
        return jsonify(results)
    except Exception as e:
        logging.exception("Error in /search-courses")
        return jsonify([])


if __name__ == '__main__':
    app.run(debug=True)