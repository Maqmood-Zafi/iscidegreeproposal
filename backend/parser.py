from flask import Flask, request, jsonify, session
import pandas as pd
from flask_cors import CORS
import secrets
import os
from copy import deepcopy  # IMPORTANT: For deep copying dictionaries

app = Flask(__name__)
CORS(app)

# Use environment variable for secret key, fallback to random for development
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(16))


class DegreeProposal:
    def __init__(self, data=None):
        if data:
            # Use deepcopy to ensure we have a completely independent copy
            self.disciplines = deepcopy(data.get('disciplines', {"ISCI": []}))
        else:
            self.reset_proposal()

        try:
            self.courses_df = pd.read_csv('courses.csv', keep_default_na=True, na_values=[''])
            self.courses_df.columns = self.courses_df.columns.str.strip()
            self.courses_df['Course'] = self.courses_df['Course'].astype(str)
            self.courses_df['Course_code'] = self.courses_df['Course_code'].astype(str)
            self.courses_df['Title'] = self.courses_df['Title'].astype(str)
        except Exception as e:
            print(f"Error initializing DegreeProposal: {str(e)}")
            raise

    def reset_proposal(self):
        self.disciplines = {"ISCI": []}

    def add_discipline(self, discipline_name):
        if discipline_name != "ISCI" and discipline_name not in self.disciplines:
            self.disciplines[discipline_name] = []
            return True
        return False

    def remove_discipline(self, discipline_name):
        if discipline_name != "ISCI" and discipline_name in self.disciplines:
            del self.disciplines[discipline_name]
            return True
        return False

    def add_course(self, discipline_name, course_code):
        if discipline_name not in self.disciplines:
            return False

        course_data = self.courses_df[self.courses_df['Course_code'] == course_code]
        if course_data.empty:
            return False

        if any(course_code in courses for courses in self.disciplines.values()):
            return False

        if discipline_name == "ISCI":
            isci_value = course_data['isci_courses'].iloc[0]
            if pd.isna(isci_value):
                return False

        self.disciplines[discipline_name].append(course_code)
        return True

    def remove_course(self, discipline_name, course_code):
        if discipline_name in self.disciplines:
            if course_code in self.disciplines[discipline_name]:
                self.disciplines[discipline_name].remove(course_code)
                return True
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
            # ... (rest of your validation logic, *unchanged* from the previous CORRECT version) ...
        validation_results = {
            'success': True,
            'messages': [],
            'total_credits': 0,
            'science_credits': 0,
            'isci_credits': 0,
            'honorary_credits': 0,
            'total_400_level_credits': 0,  # Changed from total_400_level
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
                    'met': True  # Initially true as 0 is valid
                },
                'total_400_level': {
                    'required': 12,
                    'actual': 0,
                    'met': False
                },
                'disciplines_requirements': {}
            }
        }

        # Validate number of disciplines (excluding ISCI)
        non_isci_disciplines = [d for d in self.disciplines.keys() if d != "ISCI"]
        validation_results['requirements']['discipline_count']['actual'] = len(non_isci_disciplines)
        validation_results['requirements']['discipline_count']['met'] = 2 <= len(non_isci_disciplines) <= 3
        
        if not validation_results['requirements']['discipline_count']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have 2-3 disciplines (excluding ISCI)")

        # Check each discipline has at least 9 credits
        for discipline, courses in self.disciplines.items():
            discipline_credits = sum(self.get_course_credits(course)['discipline_credit'] for course in courses)
            
            validation_results['requirements']['disciplines_requirements'][discipline] = {
                'course_count': {
                    'required': 7 if discipline == "ISCI" else 9,  # Different requirement for ISCI
                    'actual': discipline_credits,
                    'met': discipline_credits >= (7 if discipline == "ISCI" else 9)  # Different check for ISCI
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
            
            # Rest of the 400-level validation remains the same
            discipline_400_level = sum(1 for course in courses if self.is_400_level(course))
            validation_results['disciplines_400_level'][discipline] = discipline_400_level
            
            if discipline != "ISCI":
                validation_results['requirements']['disciplines_requirements'][discipline]['has_400_level']['actual'] = discipline_400_level > 0
                validation_results['requirements']['disciplines_requirements'][discipline]['has_400_level']['met'] = discipline_400_level > 0
                
                if discipline_400_level < 1:
                    validation_results['success'] = False
                    validation_results['messages'].append(f"Discipline {discipline} must have at least one 400-level course")

        # Initialize total credits outside the loop
        total_credits = 0

        # Initialize variables to track regular and honorary science credits
        non_isci_science_credits = 0
        total_science_credits = 0
        honorary_credits_available = 0

        # Initialize 400-level credits counter
        total_400_level_credits = 0

        # Calculate initial credits
        for discipline, courses in self.disciplines.items():
            discipline_total = 0
            for course in courses:
                credits = self.get_course_credits(course)
                
                # Add to 400-level credits if applicable
                if self.is_400_level(course):
                    total_400_level_credits += credits['discipline_credit']
                
                if discipline == "ISCI":
                    if credits['isci_course']:
                        isci_value = credits['isci_value'] or credits['discipline_credit']
                        validation_results['isci_credits'] += isci_value
                        total_science_credits += isci_value
                else:
                    # Add to discipline total
                    discipline_total += credits['discipline_credit']
                    
                    # Track regular science credits
                    if credits['science_credit']:
                        science_value = credits['science_value']
                        non_isci_science_credits += science_value
                        total_science_credits += science_value
                    
                    # Track available honorary credits
                    if credits['honorary_credit']:
                        honorary_value = credits['honorary_value']
                        honorary_credits_available += honorary_value
                        validation_results['non_isci_honorary_credits'] = honorary_credits_available

            # Add discipline total to total credits
            if discipline != "ISCI":
                total_credits += discipline_total

        # Calculate how many honorary credits can be used (up to 9)
        honorary_credits_used = min(9, honorary_credits_available)

        # Update science credit totals including honorary credits
        validation_results['non_isci_science_credits'] = non_isci_science_credits + honorary_credits_used
        total_science = total_science_credits + honorary_credits_used

        # Update validation results
        validation_results['requirements']['science_credits']['actual'] = total_science
        validation_results['requirements']['science_credits']['met'] = total_science >= 40

        validation_results['requirements']['non_isci_science_credits']['actual'] = validation_results['non_isci_science_credits']
        validation_results['requirements']['non_isci_science_credits']['met'] = validation_results['non_isci_science_credits'] >= 27

        # Update the total credits in validation results
        validation_results['total_credits'] = total_credits
        validation_results['requirements']['total_credits']['actual'] = total_credits
        validation_results['requirements']['total_credits']['met'] = total_credits >= 33

        # Update requirements check
        validation_results['requirements']['isci_credits']['actual'] = validation_results['isci_credits']
        validation_results['requirements']['isci_credits']['met'] = validation_results['isci_credits'] >= 7
        
        validation_results['requirements']['honorary_credits']['actual'] = validation_results['non_isci_honorary_credits']
        validation_results['requirements']['honorary_credits']['met'] = validation_results['non_isci_honorary_credits'] <= 9
        
        validation_results['requirements']['total_400_level']['actual'] = validation_results['total_400_level_credits']
        validation_results['requirements']['total_400_level']['met'] = validation_results['total_400_level_credits'] >= 12

        # Update the validation results with 400-level credits
        validation_results['total_400_level_credits'] = total_400_level_credits
        validation_results['requirements']['total_400_level']['actual'] = total_400_level_credits
        validation_results['requirements']['total_400_level']['met'] = total_400_level_credits >= 12

        # Validate ISCI requirements
        if not validation_results['requirements']['isci_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 7 credits of ISCI courses")

        # Validate total credits (excluding ISCI)
        if not validation_results['requirements']['total_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 33 total credits across non-ISCI disciplines")

        # Validate science credits
        if not validation_results['requirements']['science_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 40 total science credits")

        # Within the non-ISCI disciplines, validate science credits
        if not validation_results['requirements']['non_isci_science_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have at least 27 science credits in non-ISCI disciplines")

        # Validate honorary credits
        if not validation_results['requirements']['honorary_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Maximum 9 honorary credits can count toward the 27 science credits requirement")

        # Validate 400-level requirements
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
            print(f"Error in search_courses: {str(e)}")
            return []

    def serialize(self):
        # Serialize only the necessary data.
        return {
            'disciplines': self.disciplines
        }

    @staticmethod
    def deserialize(data):
        # Create a new DegreeProposal object from the session data.
        return DegreeProposal(data)

# --- API Endpoints ---

# Helper function to get the DegreeProposal from the session
def get_proposal():
    if 'degree_proposal' not in session:
        session['degree_proposal'] = DegreeProposal().serialize()  # Initialize if not present
    return DegreeProposal.deserialize(session['degree_proposal'])

# Helper function to save the DegreeProposal to the session
def save_proposal(proposal):
    session['degree_proposal'] = proposal.serialize()


@app.route('/reset', methods=['POST'])
def reset_proposal():
    try:
        # Create and immediately save a *new* proposal.  Much cleaner.
        save_proposal(DegreeProposal())
        return jsonify({'success': True, 'message': 'Proposal reset successfully'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/disciplines', methods=['POST'])
def add_discipline():
    proposal = get_proposal()  # Get a *copy* from the session
    data = request.json
    success = proposal.add_discipline(data['discipline_name'])
    if success:
        save_proposal(proposal)  # Save the *entire* modified proposal
        results = proposal.validate_proposal()
        return jsonify({'success': success, 'validation': results})
    return jsonify({'success': success})



@app.route('/disciplines/<discipline_name>', methods=['DELETE'])
def remove_discipline(discipline_name):
    proposal = get_proposal()
    success = proposal.remove_discipline(discipline_name)
    if success:
        save_proposal(proposal)
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
            save_proposal(proposal)
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
            course_data = proposal.courses_df[proposal.courses_df['Course_code'] == data['course_code']]
            if not course_data.empty:
                isci_course = not pd.isna(course_data['isci_courses'].iloc[0]) and course_data['isci_courses'].iloc[0] > 0
                if data['discipline_name'] == "ISCI" and not isci_course:
                    return jsonify({
                        'success': False,
                        'message': 'Only ISCI courses can be added to the ISCI discipline'
                    })
            return jsonify({'success': False, 'message': 'Course already exists or invalid course code.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/courses', methods=['DELETE'])
def remove_course():
    proposal = get_proposal()
    data = request.json
    success = proposal.remove_course(data['discipline_name'], data['course_code'])
    if success:
        save_proposal(proposal)
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
        print(f"Search endpoint error: {str(e)}")
        return jsonify([])


if __name__ == '__main__':
    app.run(debug=True)