# backend/app.py
from flask import Flask, request, jsonify
import pandas as pd
from flask_cors import CORS
import uuid
import time

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "DELETE"],
        "allow_headers": ["Content-Type"]
    }
})

# Dictionary to store user proposals by session ID
user_proposals = {}
# Track last activity time for cleanup
last_activity = {}
# Session timeout (24 hours)
SESSION_TIMEOUT = 86400

def get_user_proposal(session_id=None):
    """Get or create a proposal for the session"""
    # Use provided session ID or generate a new one
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Create new proposal if needed
    if session_id not in user_proposals:
        user_proposals[session_id] = DegreeProposal()
    
    # Update last activity time
    last_activity[session_id] = time.time()
    
    # Clean up inactive sessions occasionally
    if len(user_proposals) > 100 or (time.time() % 3600 < 10):
        cleanup_inactive_sessions()
        
    return session_id, user_proposals[session_id]

def cleanup_inactive_sessions():
    """Remove inactive sessions"""
    current_time = time.time()
    inactive_ids = [
        session_id for session_id, last_time in last_activity.items()
        if current_time - last_time > SESSION_TIMEOUT
    ]
    
    for session_id in inactive_ids:
        if session_id in user_proposals:
            del user_proposals[session_id]
        if session_id in last_activity:
            del last_activity[session_id]

class DegreeProposal:
    def __init__(self):
        try:
            # Read CSV and strip whitespace from column names
            self.courses_df = pd.read_csv('courses.csv')
            self.courses_df.columns = self.courses_df.columns.str.strip()
            
            # Convert columns to appropriate types
            self.courses_df['Course'] = self.courses_df['Course'].astype(str)
            self.courses_df['Course_code'] = self.courses_df['Course_code'].astype(str)
            self.courses_df['Title'] = self.courses_df['Title'].astype(str)
            
            self.reset_proposal()
        except Exception as e:
            print(f"Error initializing DegreeProposal: {str(e)}")
            raise
        
    def reset_proposal(self):
        # Reset to initial state with only ISCI discipline
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
            
        # Check if course is already added to any discipline
        if any(course_code in courses for courses in self.disciplines.values()):
            return False
            
        # For ISCI discipline, only allow ISCI courses
        if discipline_name == "ISCI":
            isci_value = course_data.iloc[0]['isci_courses']
            if pd.isna(isci_value) or isci_value <= 0:
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
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code].iloc[0]
        course_num = str(course_data['Course'])
        base_num = ''.join(filter(str.isdigit, course_num.split()[0]))
        return int(base_num) >= 400

    def get_course_credits(self, course_code):
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code].iloc[0]
        
        # Get raw values from CSV
        science_value = course_data['science_credits']
        honorary_value = course_data['honorary_credits']
        isci_value = course_data['isci_courses']
        
        return {
            'discipline_credit': float(course_data['discipline_credit']),
            # Only count as science credit if the science_credits column has a value
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
            # Convert columns to string and handle NaN values
            self.courses_df['Course'] = self.courses_df['Course'].fillna('').astype(str)
            self.courses_df['Course_code'] = self.courses_df['Course_code'].fillna('').astype(str)
            self.courses_df['Title'] = self.courses_df['Title'].fillna('').astype(str)
            
            # Search using string methods
            mask = (
                self.courses_df['Course_code'].str.lower().str.contains(query, na=False) | 
                self.courses_df['Title'].str.lower().str.contains(query, na=False)
            )
            matched_courses = self.courses_df[mask]
            
            # Sort by exact matches first
            matched_courses = matched_courses.sort_values(
                by='Course_code',
                key=lambda x: x.str.lower().str.startswith(query).astype(int),
                ascending=False
            )
            
            # Return limited results
            results = matched_courses.head(limit).to_dict('records')
            return [{'code': str(r['Course_code']), 'name': str(r['Title'])} for r in results]
        except Exception as e:
            print(f"Error in search_courses: {str(e)}")
            return []



@app.route('/reset', methods=['POST'])
def reset_proposal():
    try:
        # Get session_id from query parameter or create new one
        session_id = request.args.get('session')
        session_id, proposal = get_user_proposal(session_id)
        
        proposal.reset_proposal()
        return jsonify({
            'success': True,
            'message': 'Proposal reset successfully',
            'session_id': session_id
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/disciplines', methods=['POST'])
def add_discipline():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    data = request.json
    success = proposal.add_discipline(data['discipline_name'])
    
    # Return updated validation after adding discipline
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': success, 
            'validation': results,
            'session_id': session_id
        })
    return jsonify({
        'success': success,
        'session_id': session_id
    })

@app.route('/disciplines/<discipline_name>', methods=['DELETE'])
def remove_discipline(discipline_name):
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    success = proposal.remove_discipline(discipline_name)
    
    # Return updated validation after removing discipline
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': success, 
            'validation': results,
            'session_id': session_id
        })
    return jsonify({
        'success': success,
        'session_id': session_id
    })

@app.route('/courses', methods=['POST'])
def add_course():
    try:
        # Get session_id from query parameter
        session_id = request.args.get('session')
        session_id, proposal = get_user_proposal(session_id)
        
        data = request.json
        success = proposal.add_course(data['discipline_name'], data['course_code'])
        
        if success:
            course_data = proposal.courses_df[
                proposal.courses_df['Course_code'] == data['course_code']
            ].iloc[0]
            
            results = proposal.validate_proposal()
            return jsonify({
                'success': success,
                'validation': results,
                'course': {
                    'code': data['course_code'],
                    'title': course_data['Title']
                },
                'session_id': session_id
            })
        else:
            # Check why the course couldn't be added
            course_data = proposal.courses_df[
                proposal.courses_df['Course_code'] == data['course_code']
            ]
            if not course_data.empty:
                isci_course = not pd.isna(course_data.iloc[0]['isci_courses']) and course_data.iloc[0]['isci_courses'] > 0
                if data['discipline_name'] == "ISCI" and not isci_course:
                    return jsonify({
                        'success': False,
                        'message': 'Only ISCI courses can be added to the ISCI discipline',
                        'session_id': session_id
                    })
                        
            return jsonify({
                'success': False,
                'session_id': session_id
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/courses', methods=['DELETE'])
def remove_course():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    data = request.json
    success = proposal.remove_course(data['discipline_name'], data['course_code'])
    
    # Return updated validation after removing course
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': success, 
            'validation': results,
            'session_id': session_id
        })
    return jsonify({
        'success': success,
        'session_id': session_id
    })

@app.route('/validate', methods=['GET'])
def validate_proposal():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    results = proposal.validate_proposal()
    return jsonify({
        **results,
        'session_id': session_id
    })

@app.route('/search-courses', methods=['GET'])
def search_courses():
    try:
        # Get session_id from query parameter
        session_id = request.args.get('session')
        session_id, proposal = get_user_proposal(session_id)
        
        query = request.args.get('query', '')
        results = proposal.search_courses(query)
        return jsonify({
            'results': results,
            'session_id': session_id
        })
    except Exception as e:
        print(f"Search endpoint error: {str(e)}")
        return jsonify({
            'results': [],
            'session_id': session_id if 'session_id' in locals() else None
        })

@app.route('/proposal-state', methods=['GET'])
def get_proposal_state():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    # Return the complete proposal state
    return jsonify({
        'disciplines': proposal.disciplines,
        'session_id': session_id
    })

if __name__ == '__main__':
    app.run(debug=True)

